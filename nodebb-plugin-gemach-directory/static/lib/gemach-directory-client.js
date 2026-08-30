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
	var CATEGORIES = ['כלי עבודה', 'ציוד רפואי', 'ציוד לרכב', 'ציוד לתינוקות', 'ציוד לאירועים', 'ריהוט', 'ספרים ולימוד', 'אחר'];
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

	function normalizeTitle(str) {
		return String(str || '').replace(/["'׳״]/g, '').replace(/\s+/g, '');
	}

	function isDirectoryTopic() {
		try {
			var title = (window.ajaxify && ajaxify.data && ajaxify.data.title) || '';
			return normalizeTitle(title).indexOf('רשימתגמחים') !== -1;
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
			+ '#' + APP_ID + '{font-family:Rubik,Arial,sans-serif;direction:rtl;margin-top:18px;'
			+ 'padding-top:14px;border-top:1px solid #e9e3d8;}'
			+ '#' + APP_ID + ' .gd-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;}'
			+ '#' + APP_ID + ' select{padding:8px 10px;border:1px solid #e9e3d8;border-radius:8px;background:#fff;'
			+ 'font-family:inherit;font-size:13.5px;color:#332f28;}'
			+ '#' + APP_ID + ' .gd-add-btn{margin-inline-start:auto;padding:9px 18px;border-radius:20px;border:none;'
			+ 'background:#4f6b57;color:#fff;font-weight:600;font-size:13.5px;cursor:pointer;font-family:inherit;}'
			+ '#' + APP_ID + ' .gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;}'
			+ '#' + APP_ID + ' .gd-card{background:#faf7f2;border:1px solid #e9e3d8;border-radius:12px;padding:14px 16px;}'
			+ '#' + APP_ID + ' .gd-card-title{font-family:"Frank Ruhl Libre",serif;font-size:16px;color:#332f28;margin-bottom:4px;}'
			+ '#' + APP_ID + ' .gd-card-meta{font-size:12px;color:#867d6e;margin-bottom:8px;}'
			+ '#' + APP_ID + ' .gd-card-desc{font-size:13px;color:#5c5346;margin-bottom:8px;line-height:1.5;}'
			+ '#' + APP_ID + ' .gd-card-contact{font-size:13px;color:#4f6b57;font-weight:600;}'
			+ '#' + APP_ID + ' .gd-empty{color:#867d6e;font-size:13.5px;padding:10px 0;}'
			+ '#' + APP_ID + ' .gd-pending{background:#fdf0e2;border:1px solid #f0d5ac;border-radius:12px;'
			+ 'padding:14px 16px;margin-bottom:18px;}'
			+ '#' + APP_ID + ' .gd-pending h4{margin:0 0 10px;font-size:14px;color:#9a5b1e;}'
			+ '#' + APP_ID + ' .gd-pending-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;'
			+ 'padding:8px 0;border-bottom:1px solid #f0d5ac;font-size:13px;color:#332f28;}'
			+ '#' + APP_ID + ' .gd-pending-row:last-child{border-bottom:none;}'
			+ '#' + APP_ID + ' .gd-pending-row .gd-flex{flex:1;min-width:180px;}'
			+ '#' + APP_ID + ' .gd-btn-ok{background:#4f6b57;color:#fff;border:none;border-radius:6px;padding:6px 12px;'
			+ 'font-size:12.5px;cursor:pointer;font-family:inherit;}'
			+ '#' + APP_ID + ' .gd-btn-no{background:#fff;color:#a14444;border:1px solid #e0b8b8;border-radius:6px;'
			+ 'padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + '-overlay{position:fixed;inset:0;background:rgba(30,26,20,.5);z-index:2000;'
			+ 'display:flex;align-items:center;justify-content:center;padding:20px;}'
			+ '#' + MODAL_ID + '{background:#fff;border-radius:16px;padding:26px;max-width:420px;width:100%;'
			+ 'font-family:Rubik,Arial,sans-serif;direction:rtl;max-height:90vh;overflow:auto;}'
			+ '#' + MODAL_ID + ' h3{font-family:"Frank Ruhl Libre",serif;margin:0 0 16px;font-size:20px;color:#332f28;}'
			+ '#' + MODAL_ID + ' label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#332f28;}'
			+ '#' + MODAL_ID + ' .gd-field{margin-bottom:14px;}'
			+ '#' + MODAL_ID + ' input[type=text],#' + MODAL_ID + ' select,#' + MODAL_ID + ' textarea{width:100%;'
			+ 'padding:10px 12px;border:1px solid #e9e3d8;border-radius:8px;font-family:inherit;font-size:14px;'
			+ 'box-sizing:border-box;color:#332f28;}'
			+ '#' + MODAL_ID + ' textarea{resize:vertical;min-height:70px;}'
			+ '#' + MODAL_ID + ' .gd-actions{display:flex;gap:10px;margin-top:18px;}'
			+ '#' + MODAL_ID + ' .gd-submit{flex:1;padding:11px;border-radius:10px;border:none;background:#4f6b57;'
			+ 'color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-cancel{padding:11px 18px;border-radius:10px;border:1px solid #e9e3d8;'
			+ 'background:#fff;color:#867d6e;font-size:14px;cursor:pointer;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .gd-status{font-size:13px;margin-top:10px;min-height:16px;}'
			+ '#' + MODAL_ID + ' .gd-status.ok{color:#4f7a3b;}'
			+ '#' + MODAL_ID + ' .gd-status.err{color:#a14444;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	// ============ בניית תוכן ============

	function optionsHTML(list, includeOtherOnly) {
		return list.map(function (item) {
			return '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>';
		}).join('');
	}

	function buildAppShellHTML() {
		return ''
			+ '<div class="gd-toolbar">'
			+ '<select id="gd_filter_city"><option value="">כל הערים</option>' + optionsHTML(CITIES) + '</select>'
			+ '<select id="gd_filter_category"><option value="">כל הקטגוריות</option>' + optionsHTML(CATEGORIES) + '</select>'
			+ '<button type="button" class="gd-add-btn" id="gd_open_add">+ הוספת גמ"ח</button>'
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
		return ''
			+ '<div class="gd-card" data-city="' + escapeHtml(g.city) + '" data-category="' + escapeHtml(g.category) + '">'
			+ '<div class="gd-card-title">' + escapeHtml(g.name) + '</div>'
			+ '<div class="gd-card-meta">' + escapeHtml(g.city) + ' · ' + escapeHtml(g.category) + '</div>'
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
		var categoryFilter = root.querySelector('#gd_filter_category').value;

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
		app.querySelector('#gd_filter_category').addEventListener('change', function () { renderList(app); });
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
