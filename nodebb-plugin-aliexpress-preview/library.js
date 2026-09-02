/*
 * nodebb-plugin-aliexpress-preview
 *
 * מה זה עושה:
 * - כשמשתמש לוחץ על סמל קטן שמופיע ליד קישור ל-aliexpress.com בתוך פוסט,
 *   קוד הלקוח (aliexpress-preview-client.js, בקובץ נפרד) שולח לשרת את
 *   כתובת הקישור, והשרת מחזיר תקציר - שם המוצר, תמונה, ומחיר (אם נמצא) -
 *   שנקרא מתגיות ה-og: הסטנדרטיות ומ"נתונים מובנים" (JSON-LD) של דף המוצר.
 * - כל קישור נשלף מעלי אקספרס **פעם אחת בלבד לתמיד** (לא בכל ריחוף, לא
 *   לכל משתמש בנפרד) - התוצאה נשמרת במסד הנתונים של הפורום ומשם והלאה
 *   נשלפת משם ישירות, בלי לגעת בעלי אקספרס שוב.
 * - אבטחה: השרת שולף *רק* כתובות https שהדומיין שלהן הוא aliexpress.com
 *   (או תת-דומיין שלו) - כל כתובת אחרת (כולל כתובות פנימיות של הרשת עצמה)
 *   נדחית מיידית. זה מונע ניצול של הפיצ'ר כ"פרוקסי" לכתובות שרירותיות.
 * - יש הגבלת קצב בסיסית למשתמש/IP כדי שאף אחד לא יוכל להציף את השרת
 *   בבקשות שליפה.
 *
 * חשוב לדעת: עלי אקספרס עלולה בעתיד לחסום/לשנות משהו שיפסיק את זה מלעבוד
 * (זה סיכון מובנה בכל דבר שמבוסס על שליפת דף חיצוני) - זה לא קשור לתקינות
 * הקוד הזה.
 */
'use strict';

const https = require('https');
const crypto = require('crypto');
const db = require.main.require('./src/database');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const CACHE_PREFIX = 'aliexpressPreview:cache:';
const ALLOWED_HOST_SUFFIX = 'aliexpress.com';
const FETCH_TIMEOUT_MS = 8000;
// גדול יותר מרק ה-<head> - נתוני המחיר (JSON-LD) לפעמים יושבים רחוק יותר בדף.
const MAX_BYTES = 600 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
	+ '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const plugin = {};

// שליפות בתהליך ריצה - מונע שתי שליפות מקבילות לאותה כתובת בול (למשל שני
// משתמשים שונים שמרחפים על אותו קישור באותה שנייה).
const inFlight = new Map();

// הגבלת קצב בסיסית בזיכרון - מפתח (uid או IP) -> { count, windowStart }.
const rateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

plugin.init = async function () {
	registerSocketHandlers();
	console.log('[nodebb-plugin-aliexpress-preview] נטען בהצלחה');
};

function registerSocketHandlers() {
	SocketPlugins.aliexpressPreview = SocketPlugins.aliexpressPreview || {};

	SocketPlugins.aliexpressPreview.getPreview = async function (socket, data) {
		const rawUrl = data && data.url;
		if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2000) {
			throw new Error('[[error:invalid-data]]');
		}

		checkRateLimit(socket);

		let parsed;
		try {
			parsed = new URL(rawUrl);
		} catch (e) {
			throw new Error('[[error:invalid-data]]');
		}
		if (!isAllowedHost(parsed)) {
			throw new Error('[[error:invalid-data]]');
		}

		const cacheKey = CACHE_PREFIX + hashUrl(rawUrl);
		const cached = await db.getObject(cacheKey);
		if (cached) {
			return cached;
		}

		if (inFlight.has(cacheKey)) {
			return inFlight.get(cacheKey);
		}

		const fetchPromise = (async () => {
			try {
				const html = await fetchHtmlSnippet(parsed);
				const preview = parseOgTags(html) ||
					{ title: null, image: null, description: null, price: null, currency: null };
				await db.setObject(cacheKey, preview);
				return preview;
			} finally {
				inFlight.delete(cacheKey);
			}
		})();
		inFlight.set(cacheKey, fetchPromise);

		return fetchPromise;
	};
}

function checkRateLimit(socket) {
	const key = socket.uid ? ('uid:' + socket.uid) : ('ip:' + (socket.ip || 'anon'));
	const now = Date.now();
	const entry = rateLimit.get(key);

	if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
		rateLimit.set(key, { count: 1, windowStart: now });
		return;
	}

	entry.count += 1;
	if (entry.count > RATE_LIMIT_MAX) {
		throw new Error('[[error:too-many-requests]]');
	}
}

// מרשה רק https ורק דומיין שהוא aliexpress.com או תת-דומיין שלו (למשל
// he.aliexpress.com, www.aliexpress.com) - שום כתובת אחרת, כדי שהפיצ'ר
// הזה לא יהפוך ל"פרוקסי" לשליפת כתובות שרירותיות (כולל כתובות פנימיות).
function isAllowedHost(parsedUrl) {
	if (parsedUrl.protocol !== 'https:') return false;
	const host = parsedUrl.hostname.toLowerCase();
	return host === ALLOWED_HOST_SUFFIX || host.endsWith('.' + ALLOWED_HOST_SUFFIX);
}

function hashUrl(url) {
	return crypto.createHash('sha1').update(url).digest('hex');
}

// שולף עד MAX_BYTES מהדף (מספיק בהרבה בשביל ה-<head>), עם timeout, ועוקב
// אחרי הפניות (redirect) עד MAX_REDIRECTS - כל הפניה נבדקת מחדש שהיא עדיין
// בתוך דומיין aliexpress.com.
function fetchHtmlSnippet(parsedUrl, redirectsLeft) {
	if (redirectsLeft === undefined) redirectsLeft = MAX_REDIRECTS;

	return new Promise((resolve, reject) => {
		const req = https.get(parsedUrl, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
				Accept: 'text/html,application/xhtml+xml',
			},
			timeout: FETCH_TIMEOUT_MS,
		}, (res) => {
			const status = res.statusCode || 0;

			if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
				res.destroy();
				let nextUrl;
				try {
					nextUrl = new URL(res.headers.location, parsedUrl);
				} catch (e) {
					reject(new Error('bad-redirect'));
					return;
				}
				if (!isAllowedHost(nextUrl)) {
					reject(new Error('redirect-off-domain'));
					return;
				}
				resolve(fetchHtmlSnippet(nextUrl, redirectsLeft - 1));
				return;
			}

			if (status !== 200) {
				res.destroy();
				reject(new Error('bad-status-' + status));
				return;
			}

			let received = 0;
			const chunks = [];
			res.on('data', (chunk) => {
				received += chunk.length;
				chunks.push(chunk);
				if (received >= MAX_BYTES) {
					res.destroy();
				}
			});
			res.on('end', () => {
				resolve(Buffer.concat(chunks).toString('utf8'));
			});
			res.on('close', () => {
				// destroy() אחרי שהגענו לתקרה עדיין נותן לנו את מה שכבר נקרא.
				if (chunks.length) resolve(Buffer.concat(chunks).toString('utf8'));
			});
			res.on('error', reject);
		});

		req.on('timeout', () => {
			req.destroy(new Error('timeout'));
		});
		req.on('error', reject);
	});
}

function parseOgTags(html) {
	if (!html) return null;

	const title = extractMetaContent(html, 'og:title') || extractTitleTag(html);
	const image = extractMetaContent(html, 'og:image');
	const description = extractMetaContent(html, 'og:description');
	const priceInfo = extractPrice(html);

	if (!title && !image) return null;

	return {
		title: title ? truncate(decodeHtmlEntities(title), 200) : null,
		image: image || null,
		description: description ? truncate(decodeHtmlEntities(description), 300) : null,
		price: priceInfo ? priceInfo.price : null,
		currency: priceInfo ? priceInfo.currency : null,
	};
}

// מנסה שני מקורות סטנדרטיים למחיר - קודם "נתונים מובנים" (JSON-LD, תקן
// שאתרי מסחר כוללים בשביל תוצאות עשירות בגוגל), ואם אין - תגיות
// product:price:amount/currency (הרחבת Open Graph נפוצה לאתרי מסחר).
// אם שניהם לא נמצאים - פשוט אין מחיר, בלי שגיאה.
function extractPrice(html) {
	const jsonLd = extractPriceFromJsonLd(html);
	if (jsonLd) return jsonLd;

	const amount = extractMetaContent(html, 'product:price:amount');
	const currency = extractMetaContent(html, 'product:price:currency');
	if (amount) return { price: amount, currency: currency || null };

	return null;
}

function extractPriceFromJsonLd(html) {
	const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;
	while ((match = scriptRe.exec(html)) !== null) {
		let data;
		try {
			data = JSON.parse(match[1]);
		} catch (e) {
			continue; // JSON-LD לפעמים לא-תקין בפועל - פשוט מדלגים על הבלוק הזה.
		}

		const candidates = Array.isArray(data) ? data : [data];
		for (const item of candidates) {
			const found = findProductOffer(item);
			if (found) return found;
		}
	}
	return null;
}

function findProductOffer(node) {
	if (!node || typeof node !== 'object') return null;

	if (node['@graph'] && Array.isArray(node['@graph'])) {
		for (const child of node['@graph']) {
			const found = findProductOffer(child);
			if (found) return found;
		}
	}

	const type = node['@type'];
	const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
	if (isProduct && node.offers) {
		const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
		if (offer && offer.price) {
			return { price: String(offer.price), currency: offer.priceCurrency || null };
		}
	}
	return null;
}

// תומך גם ב-<meta property="og:x" content="..."> וגם בסדר הפוך של המאפיינים.
function extractMetaContent(html, property) {
	const patterns = [
		new RegExp('<meta[^>]*property=["\']' + property + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
		new RegExp('<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']' + property + '["\']', 'i'),
	];
	for (const re of patterns) {
		const match = html.match(re);
		if (match) return match[1];
	}
	return null;
}

function extractTitleTag(html) {
	const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
	return match ? match[1] : null;
}

function decodeHtmlEntities(str) {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, '\'')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

function truncate(str, max) {
	return str.length > max ? (str.slice(0, max - 1) + '…') : str;
}

module.exports = plugin;
