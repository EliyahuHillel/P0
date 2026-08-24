/*
 * ⚠️ שימו לב לפני שימוש: הקובץ הזה **לא** מתאים אם אתם צריכים פרטיות
 * אמיתית (שרק אתם רואים את התאריכים שלכם) או הצגה בתוך עמוד הפרופיל
 * האמיתי ליד ריבועי המוניטין/מייל - כי הוא שומר את הנתונים כפוסט בקטגוריה,
 * וכל משתמש מחובר יכול (דרך קריאת API ישירה, לא רק דרך המסך) לשלוף את
 * הנתונים של *כל* המשתמשים, לא רק את שלו. ה-🔒 בכותרת הוא רק קוסמטי,
 * לא הגנה אמיתית.
 *
 * לפרטיות אמיתית + מיקום בתוך עמודי הפרופיל האמיתיים (/user/<שם> ו-
 * /user/<שם>/edit) - יש להשתמש בגרסה עם שרת:
 * nodebb-plugin-insurance-reminder/ (דורש SSH, ראו ה-README שם).
 * הקובץ הזה כאן מיועד רק לפתרון ביניים זמני (רק באנר, בלי שדה בפרופיל,
 * בלי הבטחת פרטיות) עד שתהיה גישת SSH.
 *
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (אותה תיבה שבה כבר מודבק קוד "עזרה בקניית רכב" - להוסיף בסוף, לא למחוק
 * את הקיים).
 *
 * גרסה שלא דורשת SSH/שרת בכלל - כל האחסון והלוגיקה קורים דרך NodeBB עצמו,
 * באותה שיטה שכבר עובדת אצלכם באשף הרכב (app.newTopic, JSON חבוי בפוסט).
 *
 * מה זה עושה:
 * 1. מוסיף כפתור צף קבוע "ביטוח רכב" (רק למחוברים) בפינת המסך.
 * 2. לחיצה עליו פותחת חלונית עם שני שדות תאריך (תחילת ביטוח / חידוש).
 *    שמירה יוצרת פוסט חדש "שקט" בקטגוריה ייעודית (ראו הגדרה למטה) עם
 *    JSON חבוי - בדיוק כמו כרטיס הסיכום של אשף הרכב, רק בלי הכרטיס
 *    החזותי (רק הערך הגולמי, כדי לא לבלבל משתמשים אחרים שרואים את הקטגוריה).
 * 3. בכל טעינת עמוד - בודק (עם קאש מקומי, כדי לא להעמיס בקשות) מהו הפוסט
 *    האחרון שלי בקטגוריה הזו, מחשב כמה ימים נשארו לחידוש, ואם 14 או פחות -
 *    מציג באנר תזכורת בראש העמוד.
 *
 * הגבלה מודעת: אין כאן שרת, אז אין התראת-פעמון/מייל אמיתית של NodeBB -
 * רק באנר שמופיע כשפותחים את האתר (זה בדיוק מה שביקשת במקור). אם בעתיד
 * תמצא גישת SSH, יש כבר גרסת שרת מלאה מוכנה בתיקיית
 * nodebb-plugin-insurance-reminder/ בריפו - עם התראות אמיתיות + מייל.
 */
(function () {
	'use strict';

	// ===== הגדרה =====
	// NodeBB מחייב שכל נושא/פוסט יהיה שייך לאיזושהי קטגוריה - אין אפשרות
	// ליצור נושא "בלי קטגוריה" בכלל (זה אילוץ של NodeBB עצמו, לא בחירה
	// שלנו). כברירת מחדל משתמשים כאן באותה קטגוריה שכבר קיימת ועובדת
	// (82 - "עסקאות רכב", אותה קטגוריה שאשף "עזרה בקניית רכב" כבר מפרסם
	// אליה) - כך שאין שום צעד הכנה נדרש ב-ACP, אפשר להדביק ולהריץ מיד.
	// המחיר: הפוסטים הטכניים של התזכורת (מסומנים ב-🔒 בכותרת כדי שיהיה
	// ברור שהם לא מודעת רכב אמיתית) יופיעו מעורבבים בקטגוריה הזו.
	//
	// אם בעתיד תרצה הפרדה נקייה - אפשר ליצור קטגוריה ייעודית ב-ACP ->
	// Manage -> Categories, ולהחליף את המספר כאן למספר שלה (מתוך ה-URL
	// של הקטגוריה, למשל category/91/... -> המספר הוא 91). זה אופציונלי,
	// לא נדרש כדי שזה יעבוד.
	var INSURANCE_CATEGORY_ID = 82;

	var STYLE_ID = 'insurance-lite-style';
	var MODAL_ID = 'insurance-lite-modal';
	var BANNER_ID = 'insurance-lite-banner';
	var BUTTON_ID = 'insurance-lite-btn';
	var CACHE_KEY = 'insurance_lite_cache_v1';
	var MARKER_PREFIX = '<!--insurance-reminder-v1:';
	var MARKER_SUFFIX = '-->';
	var REMINDER_DAYS = 14;
	var CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 שעות - כמה זמן לסמוך על הקאש לפני שמושכים מחדש

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '#' + BUTTON_ID + '{position:fixed;bottom:18px;left:18px;z-index:1400;'
			+ 'background:#4f6b57;color:#fff;border:none;border-radius:999px;padding:11px 18px;'
			+ 'font-family:Rubik,Arial,sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;'
			+ 'box-shadow:0 4px 16px rgba(50,40,20,.25);}'
			+ '#' + MODAL_ID + '-backdrop{position:fixed;inset:0;background:rgba(40,35,25,.45);'
			+ 'z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;}'
			+ '#' + MODAL_ID + '{background:#faf7f2;border-radius:16px;max-width:420px;width:100%;'
			+ 'padding:24px;font-family:Rubik,Arial,sans-serif;direction:rtl;color:#332f28;'
			+ 'box-shadow:0 10px 40px rgba(0,0,0,.25);}'
			+ '#' + MODAL_ID + ' h3{font-family:"Frank Ruhl Libre",serif;margin:0 0 4px;font-size:20px;}'
			+ '#' + MODAL_ID + ' .il-sub{color:#867d6e;font-size:12.5px;margin:0 0 16px;}'
			+ '#' + MODAL_ID + ' .il-field{margin-bottom:14px;}'
			+ '#' + MODAL_ID + ' label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;}'
			+ '#' + MODAL_ID + ' input[type=date]{width:100%;padding:9px 11px;font-size:14px;'
			+ 'border:1px solid #e9e3d8;border-radius:8px;background:#fff;color:#332f28;'
			+ 'font-family:inherit;box-sizing:border-box;}'
			+ '#' + MODAL_ID + ' .il-actions{display:flex;gap:10px;margin-top:18px;}'
			+ '#' + MODAL_ID + ' .il-btn{flex:1;padding:11px;border-radius:10px;border:none;'
			+ 'font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;}'
			+ '#' + MODAL_ID + ' .il-btn-primary{background:#4f6b57;color:#fff;}'
			+ '#' + MODAL_ID + ' .il-btn-secondary{background:#efece8;color:#332f28;}'
			+ '#' + MODAL_ID + ' .il-note{font-size:11.5px;color:#a89f8f;margin-top:10px;line-height:1.5;}'
			+ '#' + BANNER_ID + '{position:sticky;top:0;z-index:1500;background:#fdf0e2;color:#9a5b1e;'
			+ 'font-family:Rubik,Arial,sans-serif;direction:rtl;font-size:13.5px;padding:10px 16px;'
			+ 'display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;'
			+ 'border-bottom:1px solid #f0d5ac;}'
			+ '#' + BANNER_ID + '.il-urgent{background:#fbeaea;color:#a14444;border-bottom-color:#f0c2c2;}'
			+ '#' + BANNER_ID + ' a{color:inherit;font-weight:700;text-decoration:underline;cursor:pointer;}'
			+ '#' + BANNER_ID + ' .il-dismiss{cursor:pointer;font-size:12px;opacity:.75;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	function buildMarker(data) {
		return MARKER_PREFIX + encodeURIComponent(JSON.stringify(data)) + MARKER_SUFFIX;
	}

	function parseMarker(text) {
		if (!text) return null;
		var start = text.indexOf(MARKER_PREFIX);
		if (start === -1) return null;
		var jsonStart = start + MARKER_PREFIX.length;
		var end = text.indexOf(MARKER_SUFFIX, jsonStart);
		if (end === -1) return null;
		try {
			return JSON.parse(decodeURIComponent(text.slice(jsonStart, end)));
		} catch (e) {
			return null;
		}
	}

	function isLoggedIn() {
		return !!(window.app && app.user && app.user.uid);
	}

	function daysUntil(dateStr) {
		var today = new Date();
		today.setHours(0, 0, 0, 0);
		var target = new Date(dateStr + 'T00:00:00');
		return Math.round((target - today) / 86400000);
	}

	function readCache() {
		try {
			var raw = localStorage.getItem(CACHE_KEY);
			if (!raw) return null;
			return JSON.parse(raw);
		} catch (e) {
			return null;
		}
	}

	function writeCache(data) {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({}, data, { fetchedAt: Date.now() })));
		} catch (e) { /* localStorage לא זמין - לא קריטי, פשוט נמשוך מחדש בפעם הבאה */ }
	}

	// שולף מה-שרת (דרך ה-JSON API הרגיל של NodeBB לכל עמוד) את הפוסט העדכני
	// ביותר של המשתמש הנוכחי בקטגוריית התזכורות, ומפענח ממנו את התאריכים.
	function fetchLatestFromServer(cb) {
		if (!INSURANCE_CATEGORY_ID) {
			cb(new Error('INSURANCE_CATEGORY_ID לא הוגדר - ראו הערה בראש הקובץ'));
			return;
		}
		fetch('/api/category/' + INSURANCE_CATEGORY_ID, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (catData) {
				var myTopics = (catData.topics || []).filter(function (t) {
					return t.user && Number(t.user.uid) === Number(app.user.uid);
				});
				if (!myTopics.length) {
					cb(null, null);
					return;
				}
				myTopics.sort(function (a, b) { return b.timestamp - a.timestamp; });
				var latest = myTopics[0];
				fetch('/api/topic/' + latest.slug, { credentials: 'same-origin' })
					.then(function (r) { return r.json(); })
					.then(function (topicData) {
						var post = topicData.posts && topicData.posts[0];
						var data = post ? parseMarker(post.content) : null;
						cb(null, data);
					})
					.catch(cb);
			})
			.catch(cb);
	}

	// מחזיר את הנתונים (מהקאש אם טרי מספיק, אחרת מושך מחדש) ומעדכן את הקאש.
	function getInsuranceData(forceRefresh, cb) {
		var cached = readCache();
		if (!forceRefresh && cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
			cb(cached);
			return;
		}
		fetchLatestFromServer(function (err, data) {
			if (err) {
				cb(cached || null); // בשגיאת רשת - עדיף קאש ישן מכלום
				return;
			}
			var toCache = data || { insuranceDate: '', renewalDate: '' };
			writeCache(toCache);
			cb(readCache());
		});
	}

	// ============ כפתור צף + חלונית עריכה ============

	function ensureButton() {
		if (!isLoggedIn() || document.getElementById(BUTTON_ID)) return;
		injectStyles();
		var btn = document.createElement('button');
		btn.id = BUTTON_ID;
		btn.type = 'button';
		btn.textContent = '🚗 ביטוח רכב';
		btn.addEventListener('click', openModal);
		document.body.appendChild(btn);
	}

	function closeModal() {
		var el = document.getElementById(MODAL_ID + '-backdrop');
		if (el) el.remove();
	}

	function openModal() {
		injectStyles();
		closeModal();
		var backdrop = document.createElement('div');
		backdrop.id = MODAL_ID + '-backdrop';
		var modal = document.createElement('div');
		modal.id = MODAL_ID;
		modal.innerHTML = ''
			+ '<h3>ביטוח רכב</h3>'
			+ '<p class="il-sub">שמרו את תאריך תוקף הביטוח - נזכיר לכם באנר כאן באתר, שבועיים לפני שהוא פג.</p>'
			+ '<div class="il-field"><label>תאריך תחילת הביטוח הנוכחי</label><input type="date" id="il_start"></div>'
			+ '<div class="il-field"><label>תאריך תוקף/חידוש הביטוח</label><input type="date" id="il_renewal"></div>'
			+ '<div class="il-actions">'
			+ '<button type="button" class="il-btn il-btn-secondary" id="il_cancel">ביטול</button>'
			+ '<button type="button" class="il-btn il-btn-primary" id="il_save">שמירה</button>'
			+ '</div>'
			+ '<p class="il-note">השמירה תפתח חלון פרסום מוכן מראש בקטגוריה טכנית - לחצו שם על "פרסם" כדי לסיים את השמירה.</p>';
		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);

		backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
		modal.querySelector('#il_cancel').addEventListener('click', closeModal);

		getInsuranceData(false, function (data) {
			if (!data) return;
			if (data.insuranceDate) modal.querySelector('#il_start').value = data.insuranceDate;
			if (data.renewalDate) modal.querySelector('#il_renewal').value = data.renewalDate;
		});

		modal.querySelector('#il_save').addEventListener('click', function () {
			if (!INSURANCE_CATEGORY_ID) {
				alert('לא הוגדר מספר קטגוריה בקוד (INSURANCE_CATEGORY_ID) - יש להגדיר קודם, ראו הערה בראש הקובץ.');
				return;
			}
			var insuranceDate = modal.querySelector('#il_start').value || '';
			var renewalDate = modal.querySelector('#il_renewal').value || '';
			var data = { insuranceDate: insuranceDate, renewalDate: renewalDate };

			var content = buildMarker(data)
				+ '<p>רשומת מערכת: תאריך תוקף ביטוח נשמר. אין צורך להגיב לפוסט זה.</p>';
			// 🔒 בתחילת הכותרת - כדי שיהיה מיידית ברור שזו רשומת מערכת ולא מודעת רכב אמיתית
			var title = '🔒 תזכורת ביטוח - ' + (app.user.username || app.user.userslug || app.user.uid) + ' - ' + (renewalDate || 'ללא תאריך');

			closeModal();
			// שומרים אופטימית בקאש המקומי כבר עכשיו - כדי שהבאנר יתעדכן מיד,
			// גם לפני שהמשתמש לוחץ בפועל "פרסם" בחלון של NodeBB.
			writeCache(data);

			if (typeof app.newTopic === 'function') {
				app.newTopic({ cid: INSURANCE_CATEGORY_ID, title: title, body: content });
			} else {
				alert('שגיאה: לא נמצאה פונקציית הפרסום של הפורום. נסו לרענן את הדף.');
			}
		});
	}

	// ============ באנר תזכורת ============

	function dismissKey() {
		return 'insurance_lite_dismissed_' + new Date().toISOString().slice(0, 10);
	}

	function isDismissedToday() {
		try { return localStorage.getItem(dismissKey()) === '1'; } catch (e) { return false; }
	}

	function dismissToday() {
		try { localStorage.setItem(dismissKey(), '1'); } catch (e) { /* לא קריטי */ }
		removeBanner();
	}

	function removeBanner() {
		var el = document.getElementById(BANNER_ID);
		if (el) el.remove();
	}

	function showBanner(daysLeft) {
		removeBanner();
		injectStyles();
		var urgent = daysLeft <= 0;
		var text = urgent
			? 'ביטוח הרכב שלכם פג! חדשו בהקדם האפשרי.'
			: 'נותרו ' + daysLeft + ' ימים לחידוש ביטוח הרכב שלכם.';
		var banner = document.createElement('div');
		banner.id = BANNER_ID;
		if (urgent) banner.className = 'il-urgent';
		banner.innerHTML = '<span>🚗 ' + text + ' <a id="il_banner_link">עדכון תאריך</a></span>'
			+ '<span class="il-dismiss" id="il_banner_dismiss">לא עכשיו</span>';
		document.body.insertBefore(banner, document.body.firstChild);
		banner.querySelector('#il_banner_link').addEventListener('click', openModal);
		banner.querySelector('#il_banner_dismiss').addEventListener('click', dismissToday);
	}

	function checkBanner() {
		if (!isLoggedIn() || isDismissedToday()) { removeBanner(); return; }
		getInsuranceData(false, function (data) {
			if (!data || !data.renewalDate) { removeBanner(); return; }
			var left = daysUntil(data.renewalDate);
			if (left <= REMINDER_DAYS) {
				showBanner(left);
			} else {
				removeBanner();
			}
		});
	}

	function onPageChange() {
		ensureButton();
		checkBanner();
	}

	if (window.$) {
		$(window).on('action:ajaxify.end', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
