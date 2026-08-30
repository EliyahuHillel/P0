/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (באותה תיבה שבה כבר מודבק קוד "עזרה בקניית רכב" ו"ביטוח רכב" - אפשר
 * להדביק את כל הקבצים ברצף, זה בסדר גמור שיש כמה סקריפטים ב-Custom JS).
 *
 * דורש שהפלאגין nodebb-plugin-gemach-directory מותקן ופעיל בשרת (ראו
 * README.md בתיקיית הפלאגין) - הסקריפט הזה רק בונה את ה-UI ומדבר עם
 * הפלאגין דרך socket.io (plugins.gemachDirectory.*), בלי לגעת ב-DB ישירות.
 *
 * מה זה עושה:
 * 1. פותחים נושא (topic) חדש בפורום, עם כותרת שמכילה בדיוק את המילים
 *    "רשימת גמחים" (עם או בלי גרשיים, למשל "רשימת גמ״חים - לחצו להוספה") -
 *    הסקריפט מזהה את הנושא הזה לפי הכותרת, ומוסיף בתוך הפוסט הראשון שלו
 *    (בלי למחוק את מה שכבר כתוב שם) את כל הווידג'ט: לשוניות קטגוריה (כל
 *    קטגוריה עם ערכת צבע משלה), חיפוש חופשי, סינון לפי עיר, כפתור "הוספת
 *    גמ"ח", ואת רשימת הגמ"חים המאושרים מחולקת לפי עיר. לחיצה על כרטיס
 *    גמ"ח פותחת חלונית פרטים מלאה.
 * 2. לחיצה על "הוספת גמ"ח" פותחת טופס קצר (שם, עיר, קטגוריה, איש קשר,
 *    תיאור). שליחה שומרת אותו בשרת כ"ממתין לאישור" - הוא *לא* מוצג לאף
 *    אחד, כולל מי ששלח אותו, עד שמנהל מאשר.
 * 3. למנהלים בלבד (isAdmin) - מוצג מעל הרשימה הציבורית פאנל "ממתינים
 *    לאישור" עם כפתורי אשר/דחה לכל הצעה. אישור מעביר מיידית לרשימה
 *    הציבורית, דחייה מוחקת לגמרי.
 *
 * אבטחה: הנתונים שמוזנים ע"י משתמשים (שם/עיר/תיאור וכו') מוצגים כאן דרך
 * escapeHtml לפני הזרקה ל-innerHTML, כדי למנוע החדרת קוד (XSS) דרך שדות
 * חופשיים כמו "עיר - אחר" או "תיאור".
 */
(function () {
	'use strict';

	var CITIES = ['ירושלים', 'בני ברק', 'מודיעין עילית', 'ביתר עילית', 'אלעד', 'אשדוד', 'צפת', 'רכסים'];
	// כרגע רק שתי קטגוריות (=שתי הלשוניות) - להוסיף עוד: מוסיפים מחרוזת
	// ל-CATEGORIES *וגם* ערכת צבע תואמת ב-ACCENTS למטה, ומפרסמים מחדש.
	var CATEGORIES = ['כלי עבודה', 'וויז'];
	var OTHER_VALUE = '__other__';

	// ערכת צבע + תת-כותרת נפרדת לכל קטגוריה - כדי שכל לשונית תרגיש שונה
	// ומיוחדת, ולא כמו עותק צבוע-אחרת של אותו דבר.
	var ACCENTS = {
		'כלי עבודה': {
			accent: '#d97706', dark: '#92400e', soft: '#fdf1e2',
			subtitle: 'השאילו וקבלו כלי עבודה לרכב מהקהילה - בחינם ובקלות.',
		},
		'וויז': {
			accent: '#2563eb', dark: '#1e3a8a', soft: '#e9f0ff',
			subtitle: 'מכשירי ניווט וסלולרי עם וויז - להשאלה בין חברי הקהילה.',
		},
	};
	var ACCENT_DEFAULT = { accent: '#6b7280', dark: '#374151', soft: '#f2f3f5', subtitle: 'ציוד לרכב להשאלה בקהילה.' };

	var STYLE_ID = 'gemach-directory-style';
	var APP_ID = 'gemach-directory-app';
	var MODAL_ID = 'gemach-directory-modal';
	var DETAILS_ID = 'gemach-directory-details';

	function escapeHtml(str) {
		var div = document.createElement('div');
		div.textContent = str === null || str === undefined ? '' : String(str);
		return div.innerHTML;
	}

	function truncate(str, max) {
		return str.length > max ? (str.slice(0, max - 1) + '…') : str;
	}

	function getSocket() {
		return (typeof window.socket !== 'undefined') ? window.socket : null;
	}

	function isAdmin() {
		try {
			return !!(window.app && app.user && app.user.isAdmin);
		} catch (e) {
			return false;
		}
	}

	// ============ זיהוי נושא "רשימת גמחים" לפי הכותרת ============

	// משאיר רק אותיות עבריות - מוריד כל סוג של גרש/מרכאות (יש כמה תווי
	// יוניקוד שונים שנראים זהים: ", ', ׳, ״, ", ", וכו'), רווחים, מקפים
	// וכל תו אחר. כך ההתאמה לא תלויה בדיוק באיזה תו הקלדנו/הודבק.
	function hebrewLettersOnly(str) {
		return String(str || '').replace(/[^א-ת]/g, '');
	}

	function isDirectoryTopic() {
		try {
			var title = (window.ajaxify && ajaxify.data && ajaxify.data.title) || '';
			var lettersOnly = hebrewLettersOnly(title);
			return lettersOnly.indexOf('רשימ') !== -1 && lettersOnly.indexOf('גמח') !== -1;
		} catch (e) {
			return false;
		}
	}

	function findFirstPostContent() {
		return document.querySelector('[component="post"] [component="post/content"]') ||
			document.querySelector('[component="topic/content"]');
	}

	// ============ עיצוב ============

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '#' + APP_ID + '{font-family:Rubik,Arial,sans-serif;direction:rtl;margin-top:22px;padding:0;'
			+ '--gd-accent:#6b7280;--gd-accent-dark:#374151;--gd-accent-soft:#f2f3f5;}'
			+ '#' + APP_ID + ' .gd-hero{text-align:center;padding:26px 20px 22px;border-radius:18px;margin-bottom:18px;'
			+ 'background:linear-gradient(135deg,var(--gd-accent-soft),#ffffff 65%);'
			+ 'border:1px solid rgba(0,0,0,.04);transition:background .25s ease;}'
			+ '#' + APP_ID + ' .gd-hero-title{font-family:"Frank Ruhl Libre",serif;font-size:22px;font-weight:700;'
			+ 'color:#20232b;margin:0 0 8px;}'
			+ '#' + APP_ID + ' .gd-hero-sub{font-size:13.5px;color:#5b6169;margin:0 0 16px;line-height:1.6;'
			+ 'min-height:20px;transition:color .2s ease;}'
			+ '#' + APP_ID + ' .gd-add-btn{padding:10px 24px;border-radius:22px;border:none;'
			+ 'background:var(--gd-accent);color:#fff;font-weight:700;font-size:13.5px;cursor:pointer;'
			+ 'font-family:inherit;box-shadow:0 8px 18px rgba(0,0,0,.14);'
			+ 'transition:background .2s ease,transform .12s ease;}'
			+ '#' + APP_ID + ' .gd-add-btn:hover{background:var(--gd-accent-dark);transform:translateY(-1px);}'
			+ '#' + APP_ID + ' .gd-tabs{display:flex;gap:4px;border-bottom:1px solid #e7e7ea;margin-bottom:16px;}'
			+ '#' + APP_ID + ' .gd-tab{padding:10px 18px;border:none;background:transparent;cursor:pointer;'
			+ 'font-family:inherit;font-size:14px;font-weight:600;color:#9aa0a6;'
			+ 'box-shadow:inset 0 -2px 0 transparent;transition:color .15s ease,box-shadow .15s ease;}'
			+ '#' + APP_ID + ' .gd-tab:hover{color:#5b6169;}'
			+ '#' + APP_ID + ' .gd-tab.active{color:var(--gd-accent-dark);box-shadow:inset 0 -3px 0 var(--gd-accent);}'
			+ '#' + APP_ID + ' .gd-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px;}'
			+ '#' + APP_ID + ' .gd-search{flex:1;min-width:160px;padding:7px 12px;border:1px solid #e2e3e6;'
			+ 'border-radius:8px;font-family:inherit;font-size:13px;color:#2a2d33;background:#fff;'
			+ 'transition:border-color .15s ease;}'
			+ '#' + APP_ID + ' .gd-search:focus{outline:none;border-color:var(--gd-accent);}'
			+ '#' + APP_ID + ' select{padding:7px 10px;border:1px solid #e2e3e6;border-radius:8px;background:#fff;'
			+ 'font-family:inherit;font-size:13px;color:#2a2d33;}'
			+ '#' + APP_ID + ' .gd-city-group{margin-bottom:18px;}'
			+ '#' + APP_ID + ' .gd-city-title{font-size:12px;font-weight:700;color:#9aa0a6;margin:0 0 9px;'
			+ 'text-transform:uppercase;letter-spacing:.03em;}'
			+ '#' + APP_ID + ' .gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:13px;}'
			+ '#' + APP_ID + ' .gd-card{background:#fff;border:1px solid #edeef0;border-top:4px solid var(--gd-accent);'
			+ 'border-radius:13px;padding:15px 16px 13px;cursor:pointer;'
			+ 'box-shadow:0 2px 8px rgba(20,20,30,.05);'
			+ 'transition:transform .15s ease,box-shadow .15s ease;}'
			+ '#' + APP_ID + ' .gd-card:hover{transform:translateY(-4px);box-shadow:0 14px 26px rgba(20,20,30,.13);}'
			+ '#' + APP_ID + ' .gd-card-title{font-size:15px;font-weight:700;color:#20232b;margin-bottom:6px;}'
			+ '#' + APP_ID + ' .gd-card-desc{font-size:12.5px;color:#6b7078;margin-bottom:10px;line-height:1.5;}'
			+ '#' + APP_ID + ' .gd-card-hint{font-size:11.5px;color:var(--gd-accent-dark);font-weight:600;opacity:.75;}'
			+ '#' + APP_ID + ' .gd-empty{color:#9aa0a6;font-size:13.5px;padding:24px 0;text-align:center;}'
			+ '#' + APP_ID + ' .gd-admin-bar{margin-bottom:12px;}'
			+ '#' + APP_ID + ' .gd-notify-toggle{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;'
			+ 'color:#6b7078;cursor:pointer;}'
			+ '#' + APP_ID + ' .gd-notify-toggle input{cursor:pointer;}'
			+ '#' + APP_ID + ' .gd-pending{background:#fff8ec;border:1px solid #f2e0b8;border-radius:14px;'
			+ 'padding:14px 16px;margin-bottom:20px;}'
			+ '#' + APP_ID + ' .gd-pending h4{margin:0 0 10px;font-size:14px;color:#9a6a1e;}'
			+ '#' + APP_ID + ' .gd-pending-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;'
			+ 'padding:8px 0;border-bottom:1px solid #f2e0b8;font-size:13px;color:#332f28;}'
			+ '#' + APP_ID + ' .gd-pending-row:last-child{border-bottom:none;}'
			+ '#' + APP_ID + ' .gd-pending-row .gd-flex{flex:1;min-width:180px;}'
			+ '#' + APP_ID + ' .gd-btn-ok{background:#2f6b40;color:#fff;border:none;border-radius:7px;padding:6px 12px;'
			+ 'font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:600;}'
			+ '#' + APP_ID + ' .gd-btn-no{background:#fff;color:#a14444;border:1px solid #e5c2c2;border-radius:7px;'
			+ 'padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:600;}'
			// חלוניות פופ-אפ (טופס הוספה + פרטי גמ"ח) - חולקות אותה מסגרת overlay
			+ '#' + MODAL_ID + '-overlay,#' + DETAILS_ID + '-overlay{position:fixed;inset:0;'
			+ 'background:rgba(20,22,26,.5);z-index:2000;display:flex;align-items:center;justify-content:center;'
			+ 'padding:20px;}'
			+ '#' + MODAL_ID + ',#' + DETAILS_ID + '{background:#fff;border-radius:18px;padding:26px;'
			+ 'max-width:420px;width:100%;font-family:Rubik,Arial,sans-serif;direction:rtl;max-height:90vh;'
			+ 'overflow:auto;box-shadow:0 20px 48px rgba(10,12,16,.22);position:relative;}'
			+ '#' + MODAL_ID + ' h3{font-size:19px;font-weight:700;margin:0 0 16px;color:#20232b;}'
			+ '#' + MODAL_ID + ' label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#3a3d43;}'
			+ '#' + MODAL_ID + ' .gd-field{margin-bottom:14px;}'
			+ '#' + MODAL_ID + ' input[type=text],#' + MODAL_ID + ' select,#' + MODAL_ID + ' textarea{width:100%;'
			+ 'padding:9px 11px;border:1px solid #e2e3e6;border-radius:9px;font-family:inherit;font-size:14px;'
			+ 'box-sizing:border-box;color:#20232b;background:#fbfbfc;}'
			+ '#' + MODAL_ID + ' input[type=text]:focus,#' + MODAL_ID + ' select:focus,#' + MODAL_ID + ' textarea:focus{'
			+ 'outline:none;border-color:#8a8f96;background:#fff;}'
			+ '#' + MODAL_ID + ' textarea{resize:vertical;min-height:70px;}'
			+ '#' + MODAL_ID + ' .gd-actions{display:flex;gap:10px;margin-top:16px;}'
			+ '#' + MODAL_ID + ' .gd-submit{flex:1;padding:11px;border-radius:10px;border:none;background:#20232b;'
			+ 'color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-cancel{padding:11px 16px;border-radius:10px;border:1px solid #e2e3e6;'
			+ 'background:#fff;color:#6b7078;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-status{font-size:13px;margin-top:10px;min-height:16px;}'
			+ '#' + MODAL_ID + ' .gd-status.ok{color:#2f6b40;}'
			+ '#' + MODAL_ID + ' .gd-status.err{color:#a14444;}'
			// חלונית פרטי גמ"ח
			+ '#' + DETAILS_ID + '{max-width:400px;}'
			+ '#' + DETAILS_ID + ' .gd-details-close{position:absolute;top:14px;left:16px;border:none;'
			+ 'background:transparent;font-size:22px;line-height:1;color:#9aa0a6;cursor:pointer;padding:0;}'
			+ '#' + DETAILS_ID + ' .gd-details-close:hover{color:#20232b;}'
			+ '#' + DETAILS_ID + ' .gd-badges{display:flex;gap:8px;margin-bottom:14px;}'
			+ '#' + DETAILS_ID + ' .gd-badge{background:var(--gd-accent);color:#fff;padding:4px 12px;'
			+ 'border-radius:14px;font-size:12px;font-weight:700;}'
			+ '#' + DETAILS_ID + ' .gd-badge-outline{background:transparent;border:1px solid var(--gd-accent);'
			+ 'color:var(--gd-accent-dark);}'
			+ '#' + DETAILS_ID + ' .gd-details-title{font-size:20px;font-weight:700;color:#20232b;margin:0 0 12px;}'
			+ '#' + DETAILS_ID + ' .gd-details-desc{font-size:14px;color:#4c5058;line-height:1.6;margin:0 0 18px;}'
			+ '#' + DETAILS_ID + ' .gd-details-contact{background:var(--gd-accent-soft);border-radius:12px;'
			+ 'padding:13px 16px;}'
			+ '#' + DETAILS_ID + ' .gd-details-contact-label{display:block;font-size:11.5px;font-weight:700;'
			+ 'color:var(--gd-accent-dark);text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px;}'
			+ '#' + DETAILS_ID + ' .gd-details-contact-value{font-size:16px;font-weight:700;color:#20232b;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	// ============ בניית תוכן ============

	var currentCategory = CATEGORIES[0];

	function optionsHTML(list) {
		return list.map(function (item) {
			return '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
		}).join('');
	}

	function buildTabsHTML() {
		return CATEGORIES.map(function (cat) {
			var activeClass = cat === currentCategory ? ' active' : '';
			return '<button type="button" class="gd-tab' + activeClass + '" data-category="' + escapeHtml(cat) + '">'
				+ escapeHtml(cat) + '</button>';
		}).join('');
	}

	function buildAppShellHTML() {
		return ''
			+ '<div class="gd-hero">'
			+ '<h2 class="gd-hero-title">רשימת הגמ"חים לרכב</h2>'
			+ '<p class="gd-hero-sub" id="gd_hero_sub"></p>'
			+ '<button type="button" class="gd-add-btn" id="gd_open_add">+ הוספת גמ"ח</button>'
			+ '</div>'
			+ '<div class="gd-tabs" id="gd_tabs">' + buildTabsHTML() + '</div>'
			+ '<div class="gd-toolbar">'
			+ '<input type="text" id="gd_search" class="gd-search" placeholder="חיפוש חופשי - שם, תיאור או איש קשר...">'
			+ '<select id="gd_filter_city"><option value="">כל הערים</option>' + optionsHTML(CITIES) + '</select>'
			+ '</div>'
			+ '<div id="gd_admin_pending"></div>'
			+ '<div id="gd_sections"><div class="gd-empty">טוען...</div></div>';
	}

	function buildModalHTML() {
		return ''
			+ '<h3>הוספת גמ"ח</h3>'
			+ '<div class="gd-field"><label>שם הגמ"ח</label><input type="text" id="gd_f_name" maxlength="120"></div>'
			+ '<div class="gd-field"><label>עיר</label>'
			+ '<select id="gd_f_city"><option value="">בחרו עיר</option>' + optionsHTML(CITIES)
			+ '<option value="' + OTHER_VALUE + '">עיר אחרת...</option></select>'
			+ '<input type="text" id="gd_f_city_other" placeholder="הקלידו את שם העיר" style="margin-top:8px;display:none;">'
			+ '</div>'
			+ '<div class="gd-field"><label>קטגוריה</label>'
			+ '<select id="gd_f_category"><option value="">בחרו קטגוריה</option>' + optionsHTML(CATEGORIES) + '</select></div>'
			+ '<div class="gd-field"><label>איש קשר / טלפון</label><input type="text" id="gd_f_contact" maxlength="120"></div>'
			+ '<div class="gd-field"><label>תיאור קצר (רשות)</label><textarea id="gd_f_description" maxlength="500"></textarea></div>'
			+ '<div class="gd-actions">'
			+ '<button type="button" class="gd-submit" id="gd_f_submit">שליחה לאישור</button>'
			+ '<button type="button" class="gd-cancel" id="gd_f_cancel">ביטול</button>'
			+ '</div>'
			+ '<div class="gd-status" id="gd_f_status"></div>';
	}

	function gemachCardHTML(g) {
		return ''
			+ '<div class="gd-card" data-id="' + escapeHtml(g.id) + '">'
			+ '<div class="gd-card-title">' + escapeHtml(g.name) + '</div>'
			+ (g.description ? '<div class="gd-card-desc">' + escapeHtml(truncate(g.description, 80)) + '</div>' : '')
			+ '<div class="gd-card-hint">לחצו לפרטים ←</div>'
			+ '</div>';
	}

	function pendingRowHTML(g) {
		return ''
			+ '<div class="gd-pending-row" data-id="' + escapeHtml(g.id) + '">'
			+ '<span class="gd-flex"><b>' + escapeHtml(g.name) + '</b> · ' + escapeHtml(g.city) + ' · ' + escapeHtml(g.category) + '</span>'
			+ '<button type="button" class="gd-btn-ok" data-action="approve">אשר</button>'
			+ '<button type="button" class="gd-btn-no" data-action="reject">דחה</button>'
			+ '</div>';
	}

	// ============ לוגיקה ============

	var currentGemachs = [];

	function matchesSearch(g, term) {
		if (!term) return true;
		var haystack = [g.name, g.description, g.contact].join(' ').toLowerCase();
		return haystack.indexOf(term.toLowerCase()) !== -1;
	}

	function applyAccent(root, category) {
		var theme = ACCENTS[category] || ACCENT_DEFAULT;
		root.style.setProperty('--gd-accent', theme.accent);
		root.style.setProperty('--gd-accent-dark', theme.dark);
		root.style.setProperty('--gd-accent-soft', theme.soft);
		var subtitleEl = root.querySelector('#gd_hero_sub');
		if (subtitleEl) subtitleEl.textContent = theme.subtitle;
	}

	function openDetailsModal(g) {
		if (document.getElementById(DETAILS_ID + '-overlay')) return;
		var theme = ACCENTS[g.category] || ACCENT_DEFAULT;

		var overlay = document.createElement('div');
		overlay.id = DETAILS_ID + '-overlay';
		var modal = document.createElement('div');
		modal.id = DETAILS_ID;
		modal.style.setProperty('--gd-accent', theme.accent);
		modal.style.setProperty('--gd-accent-dark', theme.dark);
		modal.style.setProperty('--gd-accent-soft', theme.soft);
		modal.innerHTML = ''
			+ '<button type="button" class="gd-details-close" id="gd_details_close" aria-label="סגירה">×</button>'
			+ '<div class="gd-badges">'
			+ '<span class="gd-badge">' + escapeHtml(g.category) + '</span>'
			+ '<span class="gd-badge gd-badge-outline">' + escapeHtml(g.city) + '</span>'
			+ '</div>'
			+ '<h3 class="gd-details-title">' + escapeHtml(g.name) + '</h3>'
			+ (g.description ? '<p class="gd-details-desc">' + escapeHtml(g.description) + '</p>' : '')
			+ '<div class="gd-details-contact">'
			+ '<span class="gd-details-contact-label">איש קשר</span>'
			+ '<span class="gd-details-contact-value">' + escapeHtml(g.contact) + '</span>'
			+ '</div>';
		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		overlay.addEventListener('click', function (e) {
			if (e.target === overlay) overlay.remove();
		});
		modal.querySelector('#gd_details_close').addEventListener('click', function () {
			overlay.remove();
		});
	}

	// מציג את הגמ"חים של הקטגוריה הפעילה (הלשונית הנבחרת) בלבד, מחולקים
	// לפי עיר. לחיצה על כרטיס פותחת חלונית פרטים מלאה.
	function renderList(root) {
		var sectionsEl = root.querySelector('#gd_sections');
		var cityFilter = root.querySelector('#gd_filter_city').value;
		var searchTerm = root.querySelector('#gd_search').value.trim();

		var filtered = currentGemachs.filter(function (g) {
			return g.category === currentCategory &&
				(!cityFilter || g.city === cityFilter) &&
				matchesSearch(g, searchTerm);
		});

		if (!filtered.length) {
			sectionsEl.innerHTML = '<div class="gd-empty">אין עדיין גמ"חים תואמים בקטגוריה הזו.</div>';
			return;
		}

		var byCity = {};
		filtered.forEach(function (g) {
			if (!byCity[g.city]) byCity[g.city] = [];
			byCity[g.city].push(g);
		});
		var cityOrder = CITIES.filter(function (c) { return byCity[c]; });
		Object.keys(byCity).forEach(function (c) {
			if (cityOrder.indexOf(c) === -1) cityOrder.push(c);
		});

		sectionsEl.innerHTML = cityOrder.map(function (city) {
			return '<div class="gd-city-group">'
				+ '<div class="gd-city-title">' + escapeHtml(city) + '</div>'
				+ '<div class="gd-grid">' + byCity[city].map(gemachCardHTML).join('') + '</div>'
				+ '</div>';
		}).join('');

		sectionsEl.querySelectorAll('.gd-card').forEach(function (card) {
			card.addEventListener('click', function () {
				var id = card.getAttribute('data-id');
				var match = currentGemachs.filter(function (x) { return String(x.id) === id; })[0];
				if (match) openDetailsModal(match);
			});
		});
	}

	function loadApprovedList(root, socket) {
		socket.emit('plugins.gemachDirectory.listApproved', {}, function (err, gemachs) {
			if (err) {
				root.querySelector('#gd_sections').innerHTML = '<div class="gd-empty">שגיאה בטעינת הרשימה.</div>';
				return;
			}
			currentGemachs = gemachs || [];
			renderList(root);
		});
	}

	// פאנל המנהל: שורת הגדרות (הפעלה/כיבוי התראות אישיות למנהל הזה בלבד -
	// לא משפיע על מנהלים אחרים) שתמיד מוצגת, ומתחתיה רשימת הממתינים לאישור
	// (שמופיעה/נעלמת לפי אם יש הצעות ממתינות).
	function loadPendingPanel(root, socket) {
		if (!isAdmin()) return;
		var panel = root.querySelector('#gd_admin_pending');

		panel.innerHTML = ''
			+ '<div class="gd-admin-bar">'
			+ '<label class="gd-notify-toggle">'
			+ '<input type="checkbox" id="gd_notify_toggle" checked> קבלת התראות אליי על הצעות גמ"ח חדשות'
			+ '</label>'
			+ '</div>'
			+ '<div id="gd_pending_list"></div>';

		var toggle = panel.querySelector('#gd_notify_toggle');
		socket.emit('plugins.gemachDirectory.getNotifyPreference', {}, function (err, res) {
			if (!err && res) toggle.checked = !!res.enabled;
		});
		toggle.addEventListener('change', function () {
			socket.emit('plugins.gemachDirectory.setNotifyPreference', { enabled: toggle.checked }, function () {});
		});

		refreshPendingList(root, socket);
	}

	function refreshPendingList(root, socket) {
		var listEl = root.querySelector('#gd_pending_list');
		if (!listEl) return;

		socket.emit('plugins.gemachDirectory.listPending', {}, function (err, pending) {
			if (err || !pending || !pending.length) {
				listEl.innerHTML = '';
				return;
			}
			listEl.innerHTML = ''
				+ '<div class="gd-pending"><h4>ממתינים לאישור (' + pending.length + ')</h4>'
				+ pending.map(pendingRowHTML).join('') + '</div>';

			listEl.querySelectorAll('.gd-pending-row button').forEach(function (btn) {
				btn.addEventListener('click', function () {
					var row = btn.closest('.gd-pending-row');
					var id = row.getAttribute('data-id');
					var action = btn.getAttribute('data-action');
					socket.emit('plugins.gemachDirectory.' + action, { id: id }, function (err2) {
						if (err2) return;
						row.remove();
						if (!listEl.querySelector('.gd-pending-row')) listEl.innerHTML = '';
						if (action === 'approve') loadApprovedList(root, socket);
					});
				});
			});
		});
	}

	function openAddModal(root, socket) {
		if (document.getElementById(MODAL_ID + '-overlay')) return;

		var overlay = document.createElement('div');
		overlay.id = MODAL_ID + '-overlay';
		var modal = document.createElement('div');
		modal.id = MODAL_ID;
		modal.innerHTML = buildModalHTML();
		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		overlay.addEventListener('click', function (e) {
			if (e.target === overlay) overlay.remove();
		});
		modal.querySelector('#gd_f_cancel').addEventListener('click', function () {
			overlay.remove();
		});

		modal.querySelector('#gd_f_city').addEventListener('change', function () {
			var otherInput = modal.querySelector('#gd_f_city_other');
			otherInput.style.display = this.value === OTHER_VALUE ? 'block' : 'none';
		});

		// טופס ההוספה נפתח עם הקטגוריה של הלשונית שבה המשתמש נמצא כרגע -
		// חוסך לו קליק מיותר, ואפשר עדיין לשנות.
		var categorySelect = modal.querySelector('#gd_f_category');
		categorySelect.value = currentCategory;

		modal.querySelector('#gd_f_submit').addEventListener('click', function () {
			var statusEl = modal.querySelector('#gd_f_status');
			var citySelect = modal.querySelector('#gd_f_city').value;
			var city = citySelect === OTHER_VALUE ?
				modal.querySelector('#gd_f_city_other').value.trim() : citySelect;

			var data = {
				name: modal.querySelector('#gd_f_name').value.trim(),
				city: city,
				category: categorySelect.value,
				contact: modal.querySelector('#gd_f_contact').value.trim(),
				description: modal.querySelector('#gd_f_description').value.trim(),
			};

			if (!data.name || !data.city || !data.category || !data.contact) {
				statusEl.className = 'gd-status err';
				statusEl.textContent = 'נא למלא שם, עיר, קטגוריה ואיש קשר.';
				return;
			}

			statusEl.className = 'gd-status';
			statusEl.textContent = 'שולח...';
			socket.emit('plugins.gemachDirectory.submit', data, function (err) {
				if (err) {
					statusEl.className = 'gd-status err';
					statusEl.textContent = 'שגיאה בשליחה - נסו שוב.';
					return;
				}
				statusEl.className = 'gd-status ok';
				statusEl.textContent = 'נשלח בהצלחה! הגמ"ח יופיע ברשימה לאחר אישור מנהל.';
				setTimeout(function () { overlay.remove(); }, 1800);
			});
		});
	}

	function injectDirectory() {
		if (!isDirectoryTopic()) return;
		if (document.getElementById(APP_ID)) return;

		var socket = getSocket();
		if (!socket) return;

		var target = findFirstPostContent();
		if (!target) return;

		injectStyles();

		var app = document.createElement('div');
		app.id = APP_ID;
		app.innerHTML = buildAppShellHTML();
		target.appendChild(app);

		applyAccent(app, currentCategory);

		app.querySelectorAll('#gd_tabs .gd-tab').forEach(function (tab) {
			tab.addEventListener('click', function () {
				currentCategory = tab.getAttribute('data-category');
				app.querySelectorAll('#gd_tabs .gd-tab').forEach(function (t) { t.classList.remove('active'); });
				tab.classList.add('active');
				applyAccent(app, currentCategory);
				renderList(app);
			});
		});

		app.querySelector('#gd_filter_city').addEventListener('change', function () { renderList(app); });
		app.querySelector('#gd_search').addEventListener('input', function () { renderList(app); });
		app.querySelector('#gd_open_add').addEventListener('click', function () { openAddModal(app, socket); });

		loadApprovedList(app, socket);
		loadPendingPanel(app, socket);
	}

	function onPageChange() {
		injectDirectory();
	}

	if (window.$) {
		$(window).on('action:ajaxify.end', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
