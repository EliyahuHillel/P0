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
 *    "ביטוח רכב" עם שני שדות תאריך (תחילת ביטוח / תוקף עד-חידוש) וכפתור
 *    שמירה, ממולאת מראש מהערכים השמורים אם יש.
 * 2. בעמוד הפרופיל הציבורי (/user/<שם-משתמש>) - כשזה הפרופיל *של עצמך*
 *    בלבד - מוסיף ריבוע "ימים לתוקף ביטוח" ליד ריבועי המוניטין/פוסטים
 *    הקיימים. אף משתמש אחר לא רואה את הריבוע הזה בפרופיל שלך (הפלאגין
 *    בצד השרת מחזיר נתונים רק למי ש-socket.uid שלו תואם, ראו library.js) -
 *    זו לא רק הסתרה בעיצוב, זו אכיפה אמיתית בשרת.
 * 3. בכל עמוד (למחובר בלבד) - אם נותרו 14 יום או פחות לחידוש (או שהתאריך
 *    כבר עבר), מציג באנר עדין בראש העמוד עם קישור ישיר לעריכת הפרופיל.
 *    ניתן "לדחות" את הבאנר להיום בלבד - הוא יופיע שוב מחר עד שהתאריך יעודכן.
 *
 * הערה על סעיף 2: ה-selector שמאתר את "איפה נמצאים ריבועי המוניטין" הוא
 * best-effort (כמה אפשרויות נפוצות ב-NodeBB) - כי אין לי גישה לעיצוב
 * בפועל של הפורום שלכם. אם הריבוע לא מופיע אחרי ההתקנה, פתחו קונסולת
 * מפתחים (F12) בעמוד הפרופיל - אם מודפסת שם אזהרה שמתחילה
 * ב-"[insurance-reminder] לא נמצא מקום" - צלמו את מבנה ה-HTML סביב ריבוע
 * המוניטין (ימני-קליק על הריבוע -> Inspect) ותשלחו לי, ואכייל את
 * ה-selector בהתאם (בדיוק כמו שכוילו הסלקטורים של שורת התגיות באשף הרכב).
 */
(function () {
	'use strict';

	var STYLE_ID = 'insurance-reminder-style';
	var CARD_ID = 'insurance-reminder-card';
	var BANNER_ID = 'insurance-reminder-banner';
	var CARD_ATTACHED_ATTR = 'data-insurance-reminder-attached';

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
			+ '#' + CARD_ID + ' .ir-status{font-size:12.5px;margin-top:10px;min-height:16px;}'
			+ '#' + CARD_ID + ' .ir-status.ok{color:#4f7a3b;}'
			+ '#' + CARD_ID + ' .ir-status.err{color:#a14444;}'
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
			+ '<p class="ir-sub">מלאו את תאריך תוקף הביטוח - נזכיר לכם כאן באתר וגם בהתראה, שבועיים לפני שהוא פג.</p>'
			+ '<div class="ir-field"><label>תאריך תחילת הביטוח הנוכחי</label><input type="date" id="ir_start"></div>'
			+ '<div class="ir-field"><label>תאריך תוקף/חידוש הביטוח</label><input type="date" id="ir_renewal"></div>'
			+ '<button type="button" class="ir-btn" id="ir_save">שמירה</button>'
			+ '<div class="ir-status" id="ir_status"></div>';
	}

	function injectCard() {
		if (!onEditPage()) return;
		var content = document.getElementById('content');
		if (!content) return;
		if (content.querySelector('#' + CARD_ID)) return;
		if (content.getAttribute(CARD_ATTACHED_ATTR)) return;

		var socket = getSocket();
		if (!socket) return;

		content.setAttribute(CARD_ATTACHED_ATTR, '1');
		injectStyles();

		var card = document.createElement('div');
		card.id = CARD_ID;
		card.innerHTML = buildCardHTML();
		content.insertBefore(card, content.firstChild);

		var statusEl = card.querySelector('#ir_status');
		var startEl = card.querySelector('#ir_start');
		var renewalEl = card.querySelector('#ir_renewal');
		var saveBtn = card.querySelector('#ir_save');

		socket.emit('plugins.insuranceReminder.get', {}, function (err, data) {
			if (err) return;
			if (data && data.insuranceDate) startEl.value = data.insuranceDate;
			if (data && data.renewalDate) renewalEl.value = data.renewalDate;
		});

		saveBtn.addEventListener('click', function () {
			saveBtn.disabled = true;
			statusEl.className = 'ir-status';
			statusEl.textContent = 'שומר...';
			socket.emit('plugins.insuranceReminder.save', {
				insuranceDate: startEl.value || '',
				renewalDate: renewalEl.value || '',
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
	}

	// ============ ריבוע בעמוד הפרופיל הציבורי /user/<slug> ============

	var STAT_ID = 'insurance-reminder-stat';

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

	// מחפש איפה NodeBB מציג את ריבועי המוניטין/פוסטים הקיימים בעמוד הפרופיל,
	// כדי להוסיף ריבוע נוסף באותו מקום/סגנון. כמה אפשרויות נפוצות - הראשונה
	// שנמצאת מנצחת. אם אף אחת לא מתאימה לעיצוב בפועל - ראו הערה בראש הקובץ.
	function findStatsAnchor() {
		var candidates = [
			'[component="account/reputation"]',
			'[component="account/postcount"]',
			'[component="account/email"]',
			'.account-sub-links',
		];
		for (var i = 0; i < candidates.length; i++) {
			var el = document.querySelector(candidates[i]);
			if (el) return el;
		}
		return null;
	}

	function injectProfileStat() {
		if (!onProfilePage() || !isOwnProfile()) return;
		if (document.getElementById(STAT_ID)) return;

		var socket = getSocket();
		if (!socket) return;

		var anchor = findStatsAnchor();
		if (!anchor) {
			console.warn('[insurance-reminder] לא נמצא מקום להוסיף את ריבוע הביטוח בעמוד הפרופיל - ראו הערה בראש הקובץ לגבי כיול ה-selector.');
			return;
		}

		socket.emit('plugins.insuranceReminder.status', {}, function (err, data) {
			if (err) return;

			var value, label;
			if (!data || data.daysLeft === null || data.daysLeft === undefined) {
				value = '-';
				label = 'תוקף ביטוח';
			} else {
				value = data.daysLeft <= 0 ? 'פג' : String(data.daysLeft);
				label = 'ימים לתוקף ביטוח';
			}

			// מעתיקים את מחלקת ה-CSS של ריבוע קיים כדי לרשת בדיוק את אותו
			// עיצוב (גודל/מסגרת/ריווח) שכבר קיים בפרופיל, ורק מחליפים תוכן.
			var el = document.createElement(anchor.tagName);
			el.id = STAT_ID;
			el.className = anchor.className;
			el.setAttribute('component', 'account/insurance-reminder');

			var strong = document.createElement('div');
			strong.style.fontWeight = '700';
			strong.textContent = value;
			var span = document.createElement('div');
			span.style.fontSize = '12px';
			span.textContent = label;
			el.appendChild(strong);
			el.appendChild(span);

			anchor.parentNode.insertBefore(el, anchor.nextSibling);
		});
	}

	// ============ באנר תזכורת בכל עמוד ============

	function dismissKey() {
		var today = new Date();
		return 'insurance_reminder_dismissed_' + today.toISOString().slice(0, 10);
	}

	function isDismissedToday() {
		try {
			return localStorage.getItem(dismissKey()) === '1';
		} catch (e) {
			return false;
		}
	}

	function dismissToday() {
		try {
			localStorage.setItem(dismissKey(), '1');
		} catch (e) { /* localStorage לא זמין - פשוט לא נשמר, לא קריטי */ }
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

		banner.querySelector('#ir_banner_dismiss').addEventListener('click', dismissToday);
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
		if (!force && isDismissedToday()) return;
		var socket = getSocket();
		if (!socket || !(window.app && app.user && app.user.uid)) return;
		socket.emit('plugins.insuranceReminder.status', {}, function (err, data) {
			if (err || !data || data.daysLeft === null || data.daysLeft === undefined) {
				removeBanner();
				return;
			}
			if (data.daysLeft <= 14) {
				if (force || !isDismissedToday()) showBanner(data.daysLeft);
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
