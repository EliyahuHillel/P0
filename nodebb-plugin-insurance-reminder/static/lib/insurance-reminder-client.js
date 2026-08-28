/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (באותה תיבה שבה כבר מודבק קוד "עזרה בקניית רכב" - אפשר להדביק את שני
 * הקבצים ברצף, זה בסדר גמור שיש כמה סקריפטים ב-Custom JS).
 *
 * דורש שהפלאגין nodebb-plugin-insurance-reminder מותקן ופעיל בשרת (ראו
 * README.md בתיקיית הפלאגין) - הסקריפט הזה רק בונה את ה-UI ומדבר עם
 * הפלאגין דרך socket.io (plugins.insuranceReminder.*), בלי לגעת ב-DB ישירות.
 *
 * מה זה עושה:
 * 1. בעמוד "עריכת פרופיל" (/user/<שם-משתמש>/edit) - מוסיף כרטיסייה
 *    "ביטוח רכב" עם שדה תאריך תוקף/חידוש, שלוש תיבות סימון (התראה
 *    בפעמון ההתראות של הפורום / גם במייל / הצגת באנר תזכורת בראש
 *    העמוד) וכפתור שמירה, ממולאת מראש מהערכים השמורים אם יש. הכרטיסייה
 *    מוצגת תמיד מיד מתחת לפריט "שיוך חשבון חיצוני" (Google וכו') - קיים
 *    אצל כל המשתמשים בפורום הזה, ולא בשום מקום אחר (לא ליד "אודותיי",
 *    לא בראש העמוד). אם העוגן הזה עדיין לא נמצא ברגע שהקוד רץ (למשל
 *    חלק מהעמוד עוד נטען), מנסים שוב כמה פעמים ברצף לפני שמוותרים.
 * 2. בעמוד "אודות" בפרופיל (/user/<שם-משתמש>) - כשזה הפרופיל *של עצמך*
 *    בלבד - מוסיף קובייה "תוקף ביטוח" בדיוק באותו עיצוב
 *    כמו הקוביות הקיימות (מייל/עיר/מוניטין/הרכב שיש לי), מיד משמאל
 *    לקוביית "הרכב שיש/היה לי". הקובייה צבועה בירוק כשנשארו הרבה ימים
 *    לחידוש, ובאדום כשצריך לחדש בקרוב או שהביטוח כבר פג. אף משתמש אחר
 *    לא רואה את הקובייה הזו בפרופיל שלך (הפלאגין בצד השרת מחזיר נתונים
 *    רק למי ש-socket.uid שלו תואם, ראו library.js) - זו לא רק הסתרה
 *    בעיצוב, זו אכיפה אמיתית בשרת.
 * 3. בכל עמוד (למחובר בלבד) - אם נותרו 14 יום או פחות לחידוש (או שהתאריך
 *    כבר עבר), מציג באנר עדין בראש העמוד עם קישור ישיר לעריכת הפרופיל.
 *    ניתן "לדחות" את הבאנר - הדחייה נשמרת רק לביקור הנוכחי בפורום (טאב/
 *    חלון זה, sessionStorage) - בכניסה הבאה לפורום (או בטאב חדש) הבאנר
 *    יופיע שוב, כל עוד התאריך לא עודכן.
 *
 * הערה על סעיף 1+2: ה-selector-ים שמאתרים "איפה שמים את זה" הם best-effort
 * לפי דוגמאות HTML קונקרטיות שנשלחו לי מהפורום עצמו. אם משהו עדיין לא
 * מופיע/נראה לא במקום אחרי ההתקנה, פתחו קונסולת מפתחים (F12) בעמוד
 * הרלוונטי - אם מודפסת שם אזהרה שמתחילה ב-"[insurance-reminder]" - צלמו
 * את מבנה ה-HTML סביב האלמנט שאמור להיות עוגן (ימני-קליק -> Inspect)
 * ותשלחו לי, ואכייל את ה-selector בהתאם.
 */
(function () {
	'use strict';

	var STYLE_ID = 'insurance-reminder-style';
	var CARD_ID = 'insurance-reminder-card';
	var BANNER_ID = 'insurance-reminder-banner';

	// נבדק ואושר על ידי מנהל - עכשיו גלוי לכל המשתמשים (כל אחד רואה רק
	// את קובייית הביטוח שלו, ראו isOwnProfile למטה + אכיפה אמיתית בשרת).
	var ABOUT_STAT_ADMIN_ONLY = false;

	function isAdmin() {
		try {
			return !!(window.app && app.user && app.user.isAdmin);
		} catch (e) {
			return false;
		}
	}

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '#' + CARD_ID + '{background:#faf7f2;border:1px solid #e9e3d8;border-radius:14px;'
			+ 'padding:20px;margin:16px 0;font-family:Rubik,Arial,sans-serif;direction:rtl;color:#332f28;'
			+ 'box-shadow:0 2px 14px rgba(80,70,50,0.05);max-width:560px;}'
			+ '#' + CARD_ID + ' h3{font-family:"Frank Ruhl Libre",serif;margin:0 0 4px;font-size:19px;}'
			+ '#' + CARD_ID + ' .ir-sub{color:#867d6e;font-size:13px;margin:0 0 16px;}'
			+ '#' + CARD_ID + ' .ir-field{margin-bottom:14px;}'
			+ '#' + CARD_ID + ' label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;}'
			+ '#' + CARD_ID + ' input[type=date]{width:100%;max-width:220px;padding:9px 11px;font-size:14px;'
			+ 'border:1px solid #e9e3d8;border-radius:8px;background:#fff;color:#332f28;font-family:inherit;'
			+ 'box-sizing:border-box;}'
			+ '#' + CARD_ID + ' .ir-btn{padding:11px 22px;border-radius:10px;border:none;font-family:inherit;'
			+ 'font-size:14px;font-weight:600;cursor:pointer;background:#4f6b57;color:#fff;}'
			+ '#' + CARD_ID + ' .ir-btn:disabled{background:#a89f8f;cursor:default;}'
			+ '#' + CARD_ID + ' .ir-check{display:flex;align-items:center;gap:8px;font-weight:400;'
			+ 'margin-bottom:6px;cursor:pointer;}'
			+ '#' + CARD_ID + ' .ir-check input{width:auto;margin:0;}'
			+ '#' + CARD_ID + ' .ir-status{font-size:12.5px;margin-top:10px;min-height:16px;}'
			+ '#' + CARD_ID + ' .ir-status.ok{color:#4f7a3b;}'
			+ '#' + CARD_ID + ' .ir-status.err{color:#a14444;}'
			+ '.ir-stat-green{color:#2e7d32;}'
			+ '.ir-stat-red{color:#c62828;}'
			+ '.ir-stat-neutral{color:#867d6e;}'
			+ '#' + BANNER_ID + '{position:sticky;top:0;z-index:1500;background:#fdf0e2;color:#9a5b1e;'
			+ 'border-bottom:1px solid #f0d5ac;font-family:Rubik,Arial,sans-serif;direction:rtl;font-size:13.5px;'
			+ 'padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;}'
			+ '#' + BANNER_ID + '.ir-urgent{background:#fbeaea;color:#a14444;border-bottom-color:#f0c2c2;}'
			+ '#' + BANNER_ID + ' a{color:inherit;font-weight:700;text-decoration:underline;}'
			+ '#' + BANNER_ID + ' .ir-dismiss{cursor:pointer;font-size:12px;opacity:.75;white-space:nowrap;}'
			+ '#' + BANNER_ID + ' .ir-dismiss:hover{opacity:1;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	function getSocket() {
		return (typeof window.socket !== 'undefined') ? window.socket : null;
	}

	// ============ כרטיסיית עריכה בעמוד /user/<slug>/edit ============

	function onEditPage() {
		try {
			return !!(window.ajaxify && ajaxify.data && ajaxify.data.template && ajaxify.data.template.name === 'account/edit');
		} catch (e) {
			return /\/user\/[^/]+\/edit\/?$/.test(location.pathname);
		}
	}

	function buildCardHTML() {
		return ''
			+ '<h3>ביטוח רכב</h3>'
			+ '<p class="ir-sub">מלאו את תאריך תוקף הביטוח - נזכיר לכם, שבועיים לפני שהוא פג, בדרך שתבחרו למטה.</p>'
			+ '<div class="ir-field"><label>תאריך תוקף/חידוש הביטוח</label><input type="date" id="ir_renewal"></div>'
			+ '<div class="ir-field">'
			+ '<label>איך לתזכר אתכם</label>'
			+ '<label class="ir-check"><input type="checkbox" id="ir_notify_bell" checked> התראה בפעמון ההתראות של הפורום</label>'
			+ '<label class="ir-check"><input type="checkbox" id="ir_notify_email"> התראה גם במייל</label>'
			+ '<label class="ir-check"><input type="checkbox" id="ir_notify_banner" checked> הצגת באנר תזכורת בראש העמוד</label>'
			+ '</div>'
			+ '<button type="button" class="ir-btn" id="ir_save">שמירה</button>'
			+ '<div class="ir-status" id="ir_status"></div>';
	}

	// מוצג תמיד מיד מתחת לפריט "שיוך חשבון חיצוני" (Google וכו') - קיים
	// אצל כל המשתמשים בפורום הזה (הרשמה מתבצעת דרך Google) - בלי נפילה
	// לעוגן אחר ובלי הופעה בראש העמוד. אם העוגן עדיין לא נמצא ב-DOM ברגע
	// שהקוד רץ (למשל כי חלק מהעמוד עוד נטען) - מנסים שוב כמה פעמים ברצף
	// לפני שמוותרים, כדי לא ליפול על "לא נמצא" בגלל תזמון בלבד.
	function findDeauthAnchor() {
		var deauthLink = document.querySelector('a[href*="/deauth/"]');
		return deauthLink && (deauthLink.closest('.list-group-item') || deauthLink.parentElement);
	}

	function findEditPageAnchorWithRetry(callback, attemptsLeft) {
		if (attemptsLeft === undefined) attemptsLeft = 20; // עד כ-6 שניות בסה"כ
		if (!onEditPage()) {
			callback(null); // עזבו את העמוד - מפסיקים לנסות
			return;
		}
		var anchor = findDeauthAnchor();
		if (anchor) {
			callback(anchor);
			return;
		}
		if (attemptsLeft <= 0) {
			callback(null);
			return;
		}
		setTimeout(function () {
			findEditPageAnchorWithRetry(callback, attemptsLeft - 1);
		}, 300);
	}

	function buildAndWireCard(socket) {
		var card = document.createElement('div');
		card.id = CARD_ID;
		card.innerHTML = buildCardHTML();

		var statusEl = card.querySelector('#ir_status');
		var renewalEl = card.querySelector('#ir_renewal');
		var notifyBellEl = card.querySelector('#ir_notify_bell');
		var notifyEmailEl = card.querySelector('#ir_notify_email');
		var notifyBannerEl = card.querySelector('#ir_notify_banner');
		var saveBtn = card.querySelector('#ir_save');

		socket.emit('plugins.insuranceReminder.get', {}, function (err, data) {
			if (err) return;
			if (data && data.renewalDate) renewalEl.value = data.renewalDate;
			if (data) {
				notifyBellEl.checked = data.notifyBell !== false;
				notifyEmailEl.checked = data.notifyEmail === true;
				notifyBannerEl.checked = data.showBanner !== false;
			}
		});

		saveBtn.addEventListener('click', function () {
			saveBtn.disabled = true;
			statusEl.className = 'ir-status';
			statusEl.textContent = 'שומר...';
			socket.emit('plugins.insuranceReminder.save', {
				renewalDate: renewalEl.value || '',
				notifyBell: notifyBellEl.checked,
				notifyEmail: notifyEmailEl.checked,
				showBanner: notifyBannerEl.checked,
			}, function (err) {
				saveBtn.disabled = false;
				if (err) {
					statusEl.className = 'ir-status err';
					statusEl.textContent = 'שגיאה בשמירה - נסו שוב.';
					return;
				}
				statusEl.className = 'ir-status ok';
				statusEl.textContent = 'נשמר בהצלחה.';
				// מרעננים את הבאנר (אולי הוא כבר לא רלוונטי / עכשיו כן) בלי לרענן את כל הדף
				checkBanner(true);
			});
		});

		return card;
	}

	function injectCard() {
		if (!onEditPage()) return;
		if (document.getElementById(CARD_ID)) return;

		var socket = getSocket();
		if (!socket) return;

		// מונע ניסיונות מקבילים: אם onPageChange נורה כמה פעמים ברצף בזמן
		// שעדיין מחכים לעוגן (ראו findEditPageAnchorWithRetry), לא מתחילים
		// שרשרת ניסיונות נוספת - זה מה שיכול לגרום לכרטיסייה כפולה.
		if (injectCard._pending) return;
		injectCard._pending = true;

		findEditPageAnchorWithRetry(function (anchor) {
			injectCard._pending = false;
			if (!anchor) {
				console.warn('[insurance-reminder] לא נמצא פריט "שיוך חשבון חיצוני" בעמוד עריכת הפרופיל - הכרטיסייה לא הוצגה. פתחו קונסולת מפתחים (F12), בדקו את מבנה ה-HTML סביב פרטי החשבון המקושר ותשלחו לי צילום מסך.');
				return;
			}
			if (document.getElementById(CARD_ID)) return;
			injectStyles();
			var card = buildAndWireCard(socket);
			// מוסיפים מיד אחרי העוגן ב-DOM - כלומר, מתחתיו ויזואלית.
			anchor.parentNode.insertBefore(card, anchor.nextSibling);
		});
	}

	// ============ ריבוע בעמוד הפרופיל הציבורי /user/<slug> ============

	var STAT_ID = 'insurance-reminder-stat';
	var STAT_PENDING_ATTR = 'data-insurance-stat-pending';

	function onProfilePage() {
		try {
			return !!(window.ajaxify && ajaxify.data && ajaxify.data.template && ajaxify.data.template.name === 'account/profile');
		} catch (e) {
			return /\/user\/[^/]+\/?(\?.*)?$/.test(location.pathname) && !/\/edit\/?$/.test(location.pathname);
		}
	}

	// מציג את הריבוע רק כשזה הפרופיל של עצמך (לא כשגולשים בפרופיל של מישהו
	// אחר) - הגנה כפולה: גם ויזואלית כאן, וגם אמיתית בשרת (socket.uid).
	function isOwnProfile() {
		try {
			return !!(window.ajaxify && ajaxify.data && window.app && app.user && Number(ajaxify.data.uid) === Number(app.user.uid));
		} catch (e) {
			return false;
		}
	}

	// מחפש את קובייית "הרכב שיש/היה לי" הקיימת בעמוד ה"אודות" - מזהים אותה
	// לפי תוכן התווית (הטקסט "הרכב"), כי כל הקוביות (מייל/עיר/מוניטין/הרכב)
	// חולקות בדיוק את אותן מחלקות CSS גנריות (card card-header וכו') וההבדל
	// היחיד ביניהן הוא התוכן. הקובייה שלנו תושתל מיד אחריה בקוד - ב-RTL
	// המשמעות היא שהיא תופיע משמאל לקוביית הרכב, בדיוק כמו שהתבקש.
	function findCarInfoAnchor() {
		var labels = document.querySelectorAll('.stat-label');
		for (var i = 0; i < labels.length; i++) {
			if (labels[i].textContent.indexOf('הרכב') !== -1) {
				return labels[i].closest('.card') || labels[i].parentElement;
			}
		}
		return null;
	}

	function injectProfileStat() {
		if (!onProfilePage() || !isOwnProfile()) return;
		if (ABOUT_STAT_ADMIN_ONLY && !isAdmin()) return;
		if (document.getElementById(STAT_ID)) return;

		var socket = getSocket();
		if (!socket) return;

		var anchor = findCarInfoAnchor();
		if (!anchor) {
			console.warn('[insurance-reminder] לא נמצאה קובייית "הרכב שיש/היה לי" בעמוד - ראו הערה בראש הקובץ לגבי כיול ה-selector.');
			return;
		}

		// מונע כפילות: onPageChange יכול להיקרא כמה פעמים ברצף (למשל גם
		// מ-DOMContentLoaded וגם מ-ajaxify.end בטעינה ראשונה), ובלי הגנה כזו
		// כל קריאה הייתה יכולה לפתוח בקשת socket משלה לפני שהקודמת סיימה
		// והכניסה את הקובייה ל-DOM - וכך נוצרות שתי קוביות "תוקף ביטוח".
		// מסמנים על העוגן עצמו *באופן סינכרוני*, לפני הבקשה ל-socket, כדי
		// שקריאה שנייה שמגיעה בינתיים תיבלם כאן ולא תתחיל בקשה כפולה.
		if (anchor.getAttribute(STAT_PENDING_ATTR)) return;
		anchor.setAttribute(STAT_PENDING_ATTR, '1');

		socket.emit('plugins.insuranceReminder.status', {}, function (err, data) {
			if (err) return;
			if (document.getElementById(STAT_ID)) return; // הגנה כפולה למקרה קיצון

			var value, colorClass;
			if (!data || data.daysLeft === null || data.daysLeft === undefined) {
				value = 'לא הוזן תאריך';
				colorClass = 'ir-stat-neutral';
			} else if (data.daysLeft <= 0) {
				value = 'פג תוקף';
				colorClass = 'ir-stat-red';
			} else if (data.daysLeft <= 14) {
				value = 'נותרו ' + data.daysLeft + ' ימים';
				colorClass = 'ir-stat-red';
			} else {
				value = 'בתוקף (' + data.daysLeft + ' ימים)';
				colorClass = 'ir-stat-green';
			}

			// מעתיקים את מחלקת ה-CSS של קובייה קיימת כדי לרשת בדיוק את אותו
			// עיצוב (גודל/מסגרת/ריווח) שכבר קיים בעמוד, ורק מחליפים תוכן -
			// בדיוק אותו מבנה HTML שנשלח לי מקוביית "הרכב שיש/היה לי".
			var el = document.createElement(anchor.tagName);
			el.id = STAT_ID;
			el.className = anchor.className;

			el.innerHTML = ''
				+ '<span class="stat-label text-xs fw-semibold"><span><i class="text-muted fa-solid fa-shield-halved"></i> תוקף ביטוח</span></span>'
				+ '<span class="text-center fs-6 ff-secondary ' + colorClass + '">' + value + '</span>';

			// קוביית הרכב יושבת בתוך מיכל-תא צר וקבוע-רוחב משלה בתוך הרשת
			// החיצונית (grid) - זו הסיבה שגרסה קודמת של הקוד יצרה באג: כל
			// דבר שמושתל *בתוך* אותו מיכל (בין אם כתוכן נערם או כשורת flex
			// פנימית) נדחס יחד עם קוביית הרכב לתוך אותו רוחב-תא בודד, במקום
			// לקבל רוחב תא משלו. הפתרון: משכפלים את מיכל-התא עצמו (בלי
			// התוכן שלו) ומוסיפים אותו כתא *נפרד וחדש* ברשת החיצונית, מיד
			// אחרי תא הרכב - כך הקובייה שלנו מקבלת בדיוק את אותו רוחב/ריווח
			// כמו כל קובייה אחרת בעמוד, ותא הרכב חוזר לגודלו המלא המקורי.
			var cell = anchor.parentNode;
			var grid = cell && cell.parentNode;
			if (grid && cell !== grid) {
				var newCell = cell.cloneNode(false);
				newCell.removeAttribute('id');
				newCell.appendChild(el);
				grid.insertBefore(newCell, cell.nextSibling);
			} else {
				// נפילה בטוחה אם המבנה בפועל שונה מהצפוי
				anchor.parentNode.insertBefore(el, anchor.nextSibling);
			}
		});
	}

	// ============ באנר תזכורת בכל עמוד ============

	// שימוש ב-sessionStorage (לא localStorage) בכוונה: "לא עכשיו" משתיק את
	// הבאנר רק לביקור הנוכחי בפורום (הטאב/החלון הזה) - ברגע שסוגרים את
	// הדפדפן/הטאב ונכנסים לפורום מחדש, הבאנר יופיע שוב (אם עדיין רלוונטי).
	// זה לא תלוי בתאריך קלנדרי כמו localStorage, ולא "משתיק לצמיתות".
	var DISMISS_KEY = 'insurance_reminder_dismissed';

	function isDismissedThisSession() {
		try {
			return sessionStorage.getItem(DISMISS_KEY) === '1';
		} catch (e) {
			return false;
		}
	}

	function dismissThisSession() {
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch (e) { /* sessionStorage לא זמין - פשוט לא נשמר, לא קריטי */ }
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
		if (urgent) banner.className = 'ir-urgent';
		banner.innerHTML = ''
			+ '<span>🚗 ' + text + ' <a href="#" id="ir_banner_link">לעדכון התאריך</a></span>'
			+ '<span class="ir-dismiss" id="ir_banner_dismiss">לא עכשיו</span>';

		document.body.insertBefore(banner, document.body.firstChild);

		banner.querySelector('#ir_banner_dismiss').addEventListener('click', dismissThisSession);
		banner.querySelector('#ir_banner_link').addEventListener('click', function (e) {
			e.preventDefault();
			if (window.app && typeof app.user !== 'undefined' && app.user.userslug && window.ajaxify) {
				ajaxify.go('user/' + app.user.userslug + '/edit');
			} else {
				location.href = '/me/edit';
			}
		});
	}

	function checkBanner(force) {
		if (!force && isDismissedThisSession()) return;
		var socket = getSocket();
		if (!socket || !(window.app && app.user && app.user.uid)) return;
		socket.emit('plugins.insuranceReminder.status', {}, function (err, data) {
			if (err || !data || data.daysLeft === null || data.daysLeft === undefined || data.showBanner === false) {
				removeBanner();
				return;
			}
			if (data.daysLeft <= 14) {
				if (force || !isDismissedThisSession()) showBanner(data.daysLeft);
			} else {
				removeBanner();
			}
		});
	}

	function onPageChange() {
		injectCard();
		injectProfileStat();
		checkBanner(false);
	}

	if (window.$) {
		$(window).on('action:ajaxify.end', onPageChange);
	}
	// בדיקה ראשונית (טעינת דף ראשונה, לפני שהאירוע הראשון של ajaxify נורה)
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
