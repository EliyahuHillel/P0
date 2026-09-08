/*
 * nodebb-plugin-topic-card-styles
 *
 * מה זה עושה:
 * - מאפשר למנהלים לבחור "עיצוב כרטיס" מיוחד לנושא ספציפי, שמחליף את השורה
 *   הרגילה שלו בכל עמודי רשימת נושאים (נושאים אחרונים/קטגוריה/לא נקראו
 *   וכו') בכרטיס גדול ומעוצב - במקום השורה הסטנדרטית של NodeBB. הבחירה
 *   נעשית מתפריט נגלל (select) שמופיע קבוע על **כל** שורת נושא, אבל מוצג
 *   רק למנהלים - כרגע יש רק עיצוב אחד ("מבחן דרכים"), אבל המנגנון בנוי כך
 *   שקל להוסיף עוד עיצובים בעתיד (רשימת KNOWN_STYLES כאן + STYLES בקוד
 *   הלקוח - ראו static/lib/topic-card-styles-client.js).
 * - הבחירה נשמרת לפי tid בלבד (SocketPlugins.topicCardStyles.setStyle,
 *   מנהלים בלבד - נבדק בשרת) - לא קשורה לתגית/קטגוריה של הנושא, גם אם יש
 *   לו תגית "מבחני דרכים" זה לא מפעיל את העיצוב אוטומטית.
 * - SocketPlugins.topicCardStyles.getRowData - פתוח לכולם (גם לא-מחוברים),
 *   כי כרטיס מעוצב שנבחר אמור להיראות לכל מי שגולש ברשימה, לא רק למנהלים.
 *   מחזיר עבור כל tid המבוקש: איזה עיצוב נבחר לו, ורק אם נבחר עיצוב שדורש
 *   נתונים נוספים (כרגע: 'driving-test') - גם כותרת/קישור/צפיות/פוסטים/
 *   הצבעות ועד 2 תמונות. תמונות נשלפות קודם דרך מנגנון ה-thumbnails הרשמי
 *   של NodeBB עצמו (topics.thumbs) - זה בדיוק מה שכבר מוצג היום ליד חלק
 *   מהשורות ברשימה, אז זה הכי אמין - ורק אם אין thumbnail בכלל, יש גיבוי
 *   שמחפש תמונות (Markdown/<img>) בתוך תוכן הפוסט הראשי עצמו.
 */
'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const STYLE_MAP_KEY = 'topicCardStyles:styleByTid';
// עיצובים ידועים בשרת - '' = ברירת מחדל (שורה רגילה, בלי כרטיס). כל עיצוב
// חדש שנוסף בעתיד ב-STYLES בקוד הלקוח *חייב* להתווסף גם כאן, אחרת השרת
// ידחה ניסיון לבחור אותו (הגנת שרת אמיתית - לא סומכים על מה שהלקוח שולח).
const KNOWN_STYLES = ['', 'driving-test'];
// עיצובים שבשבילם שווה לטרוח ולשלוף כותרת/סטטיסטיקות/תמונות - '' (ברירת
// מחדל) לא נכלל בכוונה, כי הוא אומר "השאירו שורה רגילה" ולא צריך כלום.
const STYLES_NEEDING_DATA = ['driving-test'];
const MAX_TIDS = 60;
const MAX_IMAGES = 2;

const plugin = {};

plugin.init = async function () {
	registerSocketHandlers();
	console.log('[nodebb-plugin-topic-card-styles] נטען בהצלחה');
};

function registerSocketHandlers() {
	SocketPlugins.topicCardStyles = SocketPlugins.topicCardStyles || {};

	// מחזיר לכל tid המבוקש את העיצוב הנבחר לו, ואם זה עיצוב שדורש נתונים
	// נוספים - גם את כל מה שצריך כדי לצייר את הכרטיס. tid בלי עיצוב (ברירת
	// מחדל) מוחזר כ-{ style: '' } בלבד, בלי לבזבז שאילתות על התוכן שלו.
	SocketPlugins.topicCardStyles.getRowData = async function (socket, data) {
		const tids = sanitizeTids(data && data.tids);
		if (!tids.length) return {};

		const styleByTid = await db.getObjectFields(STYLE_MAP_KEY, tids);
		const result = {};
		const needDataTids = [];

		tids.forEach((tid) => {
			const style = styleByTid[tid] || '';
			result[tid] = { style };
			if (STYLES_NEEDING_DATA.includes(style)) needDataTids.push(tid);
		});

		if (!needDataTids.length) return result;

		const topicFields = await topics.getTopicsFields(needDataTids,
			['tid', 'title', 'slug', 'mainPid', 'viewcount', 'postcount', 'upvotes', 'downvotes']);

		const tidToMainPid = {};
		topicFields.forEach((t) => { tidToMainPid[t.tid] = t.mainPid; });

		const imagesByTid = await fetchImagesForTids(tidToMainPid, needDataTids);

		topicFields.forEach((t) => {
			result[t.tid] = {
				style: styleByTid[t.tid] || '',
				title: t.title,
				url: '/topic/' + (t.slug || t.tid),
				views: t.viewcount || 0,
				posts: t.postcount || 0,
				votes: (t.upvotes || 0) - (t.downvotes || 0),
				images: imagesByTid[t.tid] || [],
			};
		});

		return result;
	};

	// קביעת עיצוב לנושא ספציפי - מנהלים בלבד. style === '' מוחק את הבחירה
	// (חזרה לשורה רגילה) במקום לשמור ערך ריק, כדי לא להצטבר "אשפה" ב-DB.
	SocketPlugins.topicCardStyles.setStyle = async function (socket, data) {
		await requireAdmin(socket);
		const tid = data && data.tid;
		const style = (data && typeof data.style === 'string') ? data.style : '';
		if (!tid || !KNOWN_STYLES.includes(style)) {
			throw new Error('[[error:invalid-data]]');
		}

		if (style === '') {
			await db.deleteObjectField(STYLE_MAP_KEY, tid);
		} else {
			await db.setObjectField(STYLE_MAP_KEY, tid, style);
		}
		return { ok: true };
	};
}

function sanitizeTids(rawTids) {
	if (!Array.isArray(rawTids)) return [];
	const cleaned = [];
	for (const raw of rawTids) {
		const tid = parseInt(raw, 10);
		if (tid > 0 && !cleaned.includes(String(tid))) cleaned.push(String(tid));
		if (cleaned.length >= MAX_TIDS) break;
	}
	return cleaned;
}

// מנסה קודם את מנגנון ה-thumbnails הרשמי של NodeBB (topics.thumbs.get) -
// זה בדיוק אותן תמונות שכבר מוצגות היום ליד חלק מהשורות ברשימה (תמונה
// שנבחרה בפועל בזמן כתיבת/עריכת הפוסט), אז זה המקור הכי אמין. רק לנושאים
// שאין להם thumbnail בכלל (המודול לא קיים בגרסת NodeBB, או שהנושא פשוט לא
// הוגדר לו אחד) - נופלים חזרה על חיפוש תמונה בתוך תוכן הפוסט הראשי עצמו.
async function fetchImagesForTids(tidToMainPid, tids) {
	const imagesByTid = {};

	try {
		if (topics.thumbs && typeof topics.thumbs.get === 'function') {
			const thumbsPerTid = await topics.thumbs.get(tids);
			tids.forEach((tid, i) => {
				const thumbs = thumbsPerTid[i] || [];
				if (thumbs && thumbs.length) {
					imagesByTid[tid] = thumbs.slice(0, MAX_IMAGES)
						.map(t => (t && t.url) ? t.url : t)
						.filter(Boolean);
				}
			});
		}
	} catch (e) {
		// מודול ה-thumbnails לא זמין בגרסת NodeBB הזו (או תקלה זמנית) -
		// פשוט ממשיכים לגיבוי למטה, לא שוברים את כל הבקשה בגלל זה.
	}

	const stillNeeded = tids.filter(tid => !imagesByTid[tid] || !imagesByTid[tid].length);
	if (!stillNeeded.length) return imagesByTid;

	const mainPids = stillNeeded.map(tid => tidToMainPid[tid]).filter(Boolean);
	const postContents = mainPids.length ?
		await posts.getPostsFields(mainPids, ['pid', 'content']) : [];
	const contentByPid = {};
	postContents.forEach((p) => { contentByPid[p.pid] = p.content; });

	stillNeeded.forEach((tid) => {
		const content = contentByPid[tidToMainPid[tid]] || '';
		imagesByTid[tid] = extractImagesFromContent(content);
	});

	return imagesByTid;
}

// גיבוי בלבד (כשאין thumbnail רשמי): שולף עד MAX_IMAGES כתובות תמונה מתוך
// תוכן הפוסט הגולמי - תומך גם בתחביר Markdown של תמונות (הצורה שרוב
// מעלי-התמונות של NodeBB מכניסים בפועל) וגם בתגית <img> גולמית.
function extractImagesFromContent(content) {
	if (!content) return [];
	const images = [];
	const markdownRe = /!\[[^\]]*\]\(([^)\s]+)/g;
	const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi;
	let match;
	while ((match = markdownRe.exec(content)) !== null && images.length < MAX_IMAGES) {
		images.push(match[1]);
	}
	while (images.length < MAX_IMAGES && (match = htmlRe.exec(content)) !== null) {
		if (!images.includes(match[1])) images.push(match[1]);
	}
	return images;
}

async function requireAdmin(socket) {
	if (!socket.uid) throw new Error('[[error:not-logged-in]]');
	const isAdmin = await user.isAdministrator(socket.uid);
	if (!isAdmin) throw new Error('[[error:no-privileges]]');
}

module.exports = plugin;
