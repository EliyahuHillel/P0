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
 *    (בלי למחוק את מה שכבר כתוב שם) את כל הווידג'ט: שני תפריטי סינון
 *    (עיר וקטגוריה), כפתור "הוספת גמ"ח", ואת רשימת הגמ"חים המאושרים.
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
	var CATEGORIES = ['ניווט (וויז/GPS)', 'כלי עבודה לרכב', 'ציוד חירום ובטיחות', 'מצברים וכבלים', 'מולטימדיה לרכב', 'גרירה וחילוץ', 'כיסויים ואביזרים', 'אחר'];
	var CATEGORY_ICONS = {
		'ניווט (וויז/GPS)': '🧭',
		'כלי עבודה לרכב': '🔧',
		'ציוד חירום ובטיחות': '🚨',
		'מצברים וכבלים': '🔋',
		'מולטימדיה לרכב': '🎵',
		'גרירה וחילוץ': '🪝',
		'כיסויים ואביזרים': '🧴',
		'אחר': '📦',
	};
	var OTHER_VALUE = '__other__';

	var STYLE_ID = 'gemach-directory-style';
	var APP_ID = 'gemach-directory-app';
	var MODAL_ID = 'gemach-directory-modal';

	function escapeHtml(str) {
		var div = document.createElement('div');
		div.textContent = str === null || str === undefined ? '' : String(str);
		return div.innerHTML;
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
			// "רשימ" מכסה גם רשימת/רשימה, "גמח" מכסה גם גמ"ח/גמחים/גמ"חים
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
			+ '#' + APP_ID + '{font-family:Rubik,Arial,sans-serif;direction:rtl;margin-top:24px;'
			+ 'padding:0;}'
			+ '#' + APP_ID + ' .gd-hero{text-align:center;background:linear-gradient(180deg,#f3f8f4,#ffffff);'
			+ 'border:1px solid #e6efe8;border-radius:20px;padding:32px 20px 26px;margin-bottom:22px;}'
			+ '#' + APP_ID + ' .gd-hero-icon{font-size:34px;margin-bottom:6px;}'
			+ '#' + APP_ID + ' .gd-hero-title{font-family:"Frank Ruhl Libre",serif;font-size:24px;color:#26352b;'
			+ 'margin:0 0 8px;}'
			+ '#' + APP_ID + ' .gd-hero-sub{font-size:14px;color:#6b7a70;margin:0 0 18px;line-height:1.6;}'
			+ '#' + APP_ID + ' .gd-add-btn{padding:11px 26px;border-radius:24px;border:none;'
			+ 'background:#3f7a54;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;'
			+ 'box-shadow:0 6px 16px rgba(63,122,84,.28);transition:transform .12s ease,box-shadow .12s ease;}'
			+ '#' + APP_ID + ' .gd-add-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(63,122,84,.34);}'
			+ '#' + APP_ID + ' .gd-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:20px;}'
			+ '#' + APP_ID + ' select{padding:9px 12px;border:1px solid #e2e6e2;border-radius:10px;background:#fff;'
			+ 'font-family:inherit;font-size:13.5px;color:#2a332c;box-shadow:0 1px 2px rgba(0,0,0,.03);}'
			+ '#' + APP_ID + ' .gd-chips{display:flex;flex-wrap:wrap;gap:8px;}'
			+ '#' + APP_ID + ' .gd-chip{padding:8px 14px;border-radius:20px;border:1px solid #e2e6e2;background:#fff;'
			+ 'font-family:inherit;font-size:13px;color:#4a5750;cursor:pointer;transition:all .12s ease;}'
			+ '#' + APP_ID + ' .gd-chip:hover{border-color:#bcd6c4;}'
			+ '#' + APP_ID + ' .gd-chip.active{background:#3f7a54;border-color:#3f7a54;color:#fff;font-weight:600;}'
			+ '#' + APP_ID + ' .gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}'
			+ '#' + APP_ID + ' .gd-card{background:#fff;border:1px solid #ecefe9;border-radius:16px;padding:16px 18px;'
			+ 'box-shadow:0 2px 10px rgba(30,40,33,.05);transition:transform .12s ease,box-shadow .12s ease;}'
			+ '#' + APP_ID + ' .gd-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(30,40,33,.09);}'
			+ '#' + APP_ID + ' .gd-card-title{font-family:"Frank Ruhl Libre",serif;font-size:16.5px;color:#26352b;margin-bottom:5px;}'
			+ '#' + APP_ID + ' .gd-card-meta{font-size:12px;color:#8a9188;margin-bottom:10px;}'
			+ '#' + APP_ID + ' .gd-card-desc{font-size:13px;color:#5c645c;margin-bottom:10px;line-height:1.55;}'
			+ '#' + APP_ID + ' .gd-card-contact{font-size:13px;color:#3f7a54;font-weight:700;'
			+ 'border-top:1px solid #f0f2ee;padding-top:9px;}'
			+ '#' + APP_ID + ' .gd-empty{color:#8a9188;font-size:13.5px;padding:20px 0;text-align:center;}'
			+ '#' + APP_ID + ' .gd-pending{background:#fff8ec;border:1px solid #f2e0b8;border-radius:16px;'
			+ 'padding:16px 18px;margin-bottom:20px;}'
			+ '#' + APP_ID + ' .gd-pending h4{margin:0 0 10px;font-size:14px;color:#9a6a1e;}'
			+ '#' + APP_ID + ' .gd-pending-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;'
			+ 'padding:9px 0;border-bottom:1px solid #f2e0b8;font-size:13px;color:#332f28;}'
			+ '#' + APP_ID + ' .gd-pending-row:last-child{border-bottom:none;}'
			+ '#' + APP_ID + ' .gd-pending-row .gd-flex{flex:1;min-width:180px;}'
			+ '#' + APP_ID + ' .gd-btn-ok{background:#3f7a54;color:#fff;border:none;border-radius:8px;padding:7px 14px;'
			+ 'font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:600;}'
			+ '#' + APP_ID + ' .gd-btn-no{background:#fff;color:#a14444;border:1px solid #e5c2c2;border-radius:8px;'
			+ 'padding:7px 14px;font-size:12.5px;cursor:pointer;font-family:inherit;font-weight:600;}'
			+ '#' + MODAL_ID + '-overlay{position:fixed;inset:0;background:rgba(24,30,25,.5);z-index:2000;'
			+ 'display:flex;align-items:center;justify-content:center;padding:20px;}'
			+ '#' + MODAL_ID + '{background:#fff;border-radius:20px;padding:28px;max-width:420px;width:100%;'
			+ 'font-family:Rubik,Arial,sans-serif;direction:rtl;max-height:90vh;overflow:auto;'
			+ 'box-shadow:0 20px 50px rgba(20,30,22,.2);}'
			+ '#' + MODAL_ID + ' h3{font-family:"Frank Ruhl Libre",serif;margin:0 0 18px;font-size:21px;color:#26352b;}'
			+ '#' + MODAL_ID + ' label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#3a453d;}'
			+ '#' + MODAL_ID + ' .gd-field{margin-bottom:14px;}'
			+ '#' + MODAL_ID + ' input[type=text],#' + MODAL_ID + ' select,#' + MODAL_ID + ' textarea{width:100%;'
			+ 'padding:10px 12px;border:1px solid #e2e6e2;border-radius:10px;font-family:inherit;font-size:14px;'
			+ 'box-sizing:border-box;color:#26352b;background:#fbfcfa;}'
			+ '#' + MODAL_ID + ' input[type=text]:focus,#' + MODAL_ID + ' select:focus,#' + MODAL_ID + ' textarea:focus{'
			+ 'outline:none;border-color:#3f7a54;background:#fff;}'
			+ '#' + MODAL_ID + ' textarea{resize:vertical;min-height:70px;}'
			+ '#' + MODAL_ID + ' .gd-actions{display:flex;gap:10px;margin-top:18px;}'
			+ '#' + MODAL_ID + ' .gd-submit{flex:1;padding:12px;border-radius:12px;border:none;background:#3f7a54;'
			+ 'color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-cancel{padding:12px 18px;border-radius:12px;border:1px solid #e2e6e2;'
			+ 'background:#fff;color:#6b7a70;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-status{font-size:13px;margin-top:10px;min-height:16px;}'
			+ '#' + MODAL_ID + ' .gd-status.ok{color:#3f7a54;}'
			+ '#' + MODAL_ID + ' .gd-status.err{color:#a14444;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	// ============ בניית תוכן ============

	function optionsHTML(list) {
		return list.map(function (item) {
			var icon = CATEGORY_ICONS[item] ? (CATEGORY_ICONS[item] + ' ') : '';
			return '<option value="' + escapeHtml(item) + '">' + icon + escapeHtml(item) + '</option>';
		}).join('');
	}

	function categoryChipsHTML() {
		var all = '<button type="button" class="gd-chip active" data-value="">🔎 הכל</button>';
		var rest = CATEGORIES.map(function (cat) {
			var icon = CATEGORY_ICONS[cat] ? (CATEGORY_ICONS[cat] + ' ') : '';
			return '<button type="button" class="gd-chip" data-value="' + escapeHtml(cat) + '">' + icon + escapeHtml(cat) + '</button>';
		}).join('');
		return all + rest;
	}

	function buildAppShellHTML() {
		return ''
			+ '<div class="gd-hero">'
			+ '<div class="gd-hero-icon">🚗</div>'
			+ '<h2 class="gd-hero-title">רשימת הגמ"חים לרכב</h2>'
			+ '<p class="gd-hero-sub">השאילו וקבלו ציוד לרכב מהקהילה - בחינם, מסודר לפי עיר וקטגוריה.</p>'
			+ '<button type="button" class="gd-add-btn" id="gd_open_add">+ הוספת גמ"ח</button>'
			+ '</div>'
			+ '<div class="gd-toolbar">'
			+ '<select id="gd_filter_city"><option value="">כל הערים</option>' + optionsHTML(CITIES) + '</select>'
			+ '<div class="gd-chips" id="gd_filter_category_chips">' + categoryChipsHTML() + '</div>'
			+ '</div>'
			+ '<div id="gd_admin_pending"></div>'
			+ '<div id="gd_list" class="gd-grid"><div class="gd-empty">טוען...</div></div>';
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
		var icon = CATEGORY_ICONS[g.category] ? (CATEGORY_ICONS[g.category] + ' ') : '';
		return ''
			+ '<div class="gd-card" data-city="' + escapeHtml(g.city) + '" data-category="' + escapeHtml(g.category) + '">'
			+ '<div class="gd-card-title">' + escapeHtml(g.name) + '</div>'
			+ '<div class="gd-card-meta">' + icon + escapeHtml(g.category) + ' · ' + escapeHtml(g.city) + '</div>'
			+ (g.description ? '<div class="gd-card-desc">' + escapeHtml(g.description) + '</div>' : '')
			+ '<div class="gd-card-contact">📞 ' + escapeHtml(g.contact) + '</div>'
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

	function renderList(root) {
		var listEl = root.querySelector('#gd_list');
		var cityFilter = root.querySelector('#gd_filter_city').value;
		var activeChip = root.querySelector('#gd_filter_category_chips .gd-chip.active');
		var categoryFilter = activeChip ? activeChip.getAttribute('data-value') : '';

		var filtered = currentGemachs.filter(function (g) {
			return (!cityFilter || g.city === cityFilter) && (!categoryFilter || g.category === categoryFilter);
		});

		if (!filtered.length) {
			listEl.innerHTML = '<div class="gd-empty">אין עדיין גמ"חים תואמים לסינון שבחרתם.</div>';
			return;
		}
		listEl.innerHTML = filtered.map(gemachCardHTML).join('');
	}

	function loadApprovedList(root, socket) {
		socket.emit('plugins.gemachDirectory.listApproved', {}, function (err, gemachs) {
			if (err) {
				root.querySelector('#gd_list').innerHTML = '<div class="gd-empty">שגיאה בטעינת הרשימה.</div>';
				return;
			}
			currentGemachs = gemachs || [];
			renderList(root);
		});
	}

	function loadPendingPanel(root, socket) {
		if (!isAdmin()) return;
		var panel = root.querySelector('#gd_admin_pending');

		socket.emit('plugins.gemachDirectory.listPending', {}, function (err, pending) {
			if (err || !pending || !pending.length) {
				panel.innerHTML = '';
				return;
			}
			panel.innerHTML = ''
				+ '<div class="gd-pending"><h4>ממתינים לאישור (' + pending.length + ')</h4>'
				+ pending.map(pendingRowHTML).join('') + '</div>';

			panel.querySelectorAll('.gd-pending-row button').forEach(function (btn) {
				btn.addEventListener('click', function () {
					var row = btn.closest('.gd-pending-row');
					var id = row.getAttribute('data-id');
					var action = btn.getAttribute('data-action');
					socket.emit('plugins.gemachDirectory.' + action, { id: id }, function (err2) {
						if (err2) return;
						row.remove();
						if (!panel.querySelector('.gd-pending-row')) panel.innerHTML = '';
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

		modal.querySelector('#gd_f_submit').addEventListener('click', function () {
			var statusEl = modal.querySelector('#gd_f_status');
			var citySelect = modal.querySelector('#gd_f_city').value;
			var city = citySelect === OTHER_VALUE ?
				modal.querySelector('#gd_f_city_other').value.trim() : citySelect;

			var data = {
				name: modal.querySelector('#gd_f_name').value.trim(),
				city: city,
				category: modal.querySelector('#gd_f_category').value,
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

		app.querySelector('#gd_filter_city').addEventListener('change', function () { renderList(app); });
		app.querySelectorAll('#gd_filter_category_chips .gd-chip').forEach(function (chip) {
			chip.addEventListener('click', function () {
				app.querySelectorAll('#gd_filter_category_chips .gd-chip').forEach(function (c) { c.classList.remove('active'); });
				chip.classList.add('active');
				renderList(app);
			});
		});
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
