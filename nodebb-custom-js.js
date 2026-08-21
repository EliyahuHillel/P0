/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (לוודא שה-checkbox "Enable Custom JS" מסומן, ואז לשמור)
 *
 * מה זה עושה:
 * כשמשתמש נמצא בקטגוריית "בקשות רכב" (או בכל דף שמעלה אותה), מופיע כפתור צף
 * שפותח טופס שאלון. בסיום מילוי הטופס, נבנה כותרת+תוכן מסודרים, ונקרא לפונקציה
 * המובנית app.newTopic() של NodeBB - זו בדיוק הפונקציה שכפתור "פוסט חדש" הרגיל
 * קורא לה. NodeBB פותח את חלון הכתיבה הרגיל, כבר מלא בתוכן שלנו, והמשתמש
 * לוחץ על כפתור הפרסום הרגיל. אין כאן שום קריאת API עצמאית, שום CORS, שום
 * טיפול ב-cookie/CSRF - הכל עובר דרך המנגנון המובנה של NodeBB.
 */
(function () {
	'use strict';

	// קטגוריית "עסקאות רכב" - https://rechavimzelaze.ovh/category/82/עסקאות-רכב
	var CATEGORY_ID = 82;

	// מצב בטא: כל עוד true, הכפתור מוצג רק למנהלים (app.user.isAdmin) - אף משתמש
	// רגיל לא רואה אותו. להחליף ל-false כדי לפתוח לכולם, אחרי אישור המנהל הראשי.
	var ADMIN_ONLY_BETA = true;

	var STYLE_ID = 'car-wizard-style';
	var MODAL_ID = 'car-wizard-modal';
	var BTN_ID = 'car-wizard-fab';

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '#' + BTN_ID + '{position:fixed;bottom:24px;left:24px;z-index:1090;'
			+ 'background:#4f6b57;color:#fff;border:none;border-radius:999px;'
			+ 'padding:14px 22px;font-family:Rubik,Arial,sans-serif;font-size:14.5px;'
			+ 'font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.18);cursor:pointer;}'
			+ '#' + MODAL_ID + '-backdrop{position:fixed;inset:0;background:rgba(40,35,25,.45);'
			+ 'z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;}'
			+ '#' + MODAL_ID + '{background:#faf7f2;border-radius:16px;max-width:560px;width:100%;'
			+ 'max-height:88vh;overflow:auto;padding:26px;font-family:Rubik,Arial,sans-serif;'
			+ 'direction:rtl;color:#332f28;box-shadow:0 10px 40px rgba(0,0,0,.25);}'
			+ '#' + MODAL_ID + ' h3{font-family:"Frank Ruhl Libre",serif;margin:0 0 4px;font-size:22px;}'
			+ '#' + MODAL_ID + ' .cw-sub{color:#867d6e;font-size:13px;margin:0 0 18px;}'
			+ '#' + MODAL_ID + ' .cw-field{margin-bottom:16px;}'
			+ '#' + MODAL_ID + ' label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;}'
			+ '#' + MODAL_ID + ' input[type=text],#' + MODAL_ID + ' input[type=number],#' + MODAL_ID + ' select,#' + MODAL_ID + ' textarea{'
			+ 'width:100%;padding:9px 11px;font-size:14px;border:1px solid #e9e3d8;border-radius:8px;'
			+ 'background:#fff;color:#332f28;box-sizing:border-box;font-family:inherit;}'
			+ '#' + MODAL_ID + ' .cw-pills{display:flex;flex-wrap:wrap;gap:6px;}'
			+ '#' + MODAL_ID + ' .cw-pill{font-size:12.5px;padding:6px 12px;border-radius:999px;'
			+ 'border:1px solid #e9e3d8;background:#fff;color:#867d6e;cursor:pointer;user-select:none;}'
			+ '#' + MODAL_ID + ' .cw-pill.active{background:#4f6b57;color:#fff;border-color:transparent;font-weight:500;}'
			+ '#' + MODAL_ID + ' .cw-range-row{display:flex;align-items:center;gap:10px;}'
			+ '#' + MODAL_ID + ' .cw-range-val{min-width:20px;text-align:center;font-weight:600;color:#4f6b57;}'
			+ '#' + MODAL_ID + ' .cw-actions{display:flex;gap:10px;margin-top:20px;}'
			+ '#' + MODAL_ID + ' .cw-btn{flex:1;padding:12px;border-radius:10px;border:none;'
			+ 'font-family:inherit;font-size:14.5px;font-weight:600;cursor:pointer;}'
			+ '#' + MODAL_ID + ' .cw-btn-primary{background:#4f6b57;color:#fff;}'
			+ '#' + MODAL_ID + ' .cw-btn-secondary{background:#efece8;color:#332f28;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	function pillGroup(name, options) {
		var html = '<div class="cw-pills" data-group="' + name + '">';
		options.forEach(function (opt) {
			html += '<div class="cw-pill" data-value="' + opt + '">' + opt + '</div>';
		});
		html += '</div>';
		return html;
	}

	function rangeField(name, label) {
		return ''
			+ '<div class="cw-field"><label>' + label + ' <span class="cw-range-val" id="cw_v_' + name + '">3</span></label>'
			+ '<div class="cw-range-row"><input type="range" min="1" max="5" value="3" id="cw_' + name + '" oninput="document.getElementById(\'cw_v_' + name + '\').textContent=this.value"></div></div>';
	}

	function buildModalHTML() {
		return ''
			+ '<h3>עזרה חכמה בקניית רכב</h3>'
			+ '<p class="cw-sub">מלאו פעם אחת - נחסוך את כל שאלות ההבהרה בתגובות.</p>'
			+ '<div class="cw-field"><label>תקציב (עד כמה, בש"ח)</label><input type="number" id="cw_budget" placeholder="למשל 60000"></div>'
			+ '<div class="cw-field"><label>ייעוד עיקרי</label>' + pillGroup('purpose', ['עירוני יומיומי', 'משפחתי', 'בין-עירוני', 'שטח']) + '</div>'
			+ '<div class="cw-field"><label>מספר נוסעים</label><select id="cw_passengers"><option value="">בחרו...</option><option>1-2</option><option>3-4</option><option>5</option><option>6-7+</option></select></div>'
			+ '<div class="cw-field"><label>נסועה שנתית (ק"מ)</label><select id="cw_mileage"><option value="">בחרו...</option><option>עד 10,000</option><option>10,000-20,000</option><option>20,000-30,000</option><option>מעל 30,000</option></select></div>'
			+ rangeField('econ', 'חשיבות חיסכון בדלק')
			+ rangeField('power', 'חשיבות כוח/עוצמה')
			+ rangeField('reliab', 'חשיבות אמינות')
			+ rangeField('comfort', 'חשיבות נוחות')
			+ rangeField('trunk', 'חשיבות גודל מטען')
			+ '<div class="cw-field"><label>גיר</label>' + pillGroup('gear', ['אוטומט', 'ידני', 'לא משנה']) + '</div>'
			+ '<div class="cw-field"><label>סוג הנעה (אפשר כמה)</label>' + pillGroup('fuel', ['בנזין', 'דיזל', 'גז', 'היברידי', 'חשמלי', 'לא משנה']) + '</div>'
			+ '<div class="cw-field"><label>יד</label>' + pillGroup('hand', ['ראשונה בלבד', 'יד 2-3 בסדר', 'לא משנה']) + '</div>'
			+ '<div class="cw-field"><label>אזור מגורים</label><input type="text" id="cw_region" placeholder="מרכז, שרון, דרום..."></div>'
			+ '<div class="cw-field"><label>הערות נוספות</label><textarea id="cw_notes" rows="2"></textarea></div>'
			+ '<div class="cw-actions">'
			+ '<button type="button" class="cw-btn cw-btn-secondary" id="cw_cancel">ביטול</button>'
			+ '<button type="button" class="cw-btn cw-btn-primary" id="cw_continue">המשך לפרסום</button>'
			+ '</div>';
	}

	function wirePills(root) {
		root.querySelectorAll('[data-group]').forEach(function (group) {
			var multi = group.getAttribute('data-group') === 'fuel';
			group.querySelectorAll('.cw-pill').forEach(function (pill) {
				pill.addEventListener('click', function () {
					if (multi) {
						pill.classList.toggle('active');
					} else {
						group.querySelectorAll('.cw-pill').forEach(function (p) { p.classList.remove('active'); });
						pill.classList.add('active');
					}
				});
			});
		});
	}

	function getGroupValue(root, name) {
		var group = root.querySelector('[data-group="' + name + '"]');
		var active = group ? group.querySelectorAll('.cw-pill.active') : [];
		return Array.prototype.map.call(active, function (p) { return p.getAttribute('data-value'); });
	}

	function closeModal() {
		var backdrop = document.getElementById(MODAL_ID + '-backdrop');
		if (backdrop) backdrop.remove();
	}

	function openWizard() {
		injectStyles();
		closeModal();
		var backdrop = document.createElement('div');
		backdrop.id = MODAL_ID + '-backdrop';
		var modal = document.createElement('div');
		modal.id = MODAL_ID;
		modal.innerHTML = buildModalHTML();
		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);
		wirePills(modal);

		backdrop.addEventListener('click', function (e) {
			if (e.target === backdrop) closeModal();
		});
		modal.querySelector('#cw_cancel').addEventListener('click', closeModal);

		modal.querySelector('#cw_continue').addEventListener('click', function () {
			var budget = modal.querySelector('#cw_budget').value || 'לא צוין';
			var purpose = getGroupValue(modal, 'purpose')[0] || 'לא צוין';
			var passengers = modal.querySelector('#cw_passengers').value || 'לא צוין';
			var mileage = modal.querySelector('#cw_mileage').value || 'לא צוין';
			var econ = modal.querySelector('#cw_econ').value;
			var power = modal.querySelector('#cw_power').value;
			var reliab = modal.querySelector('#cw_reliab').value;
			var comfort = modal.querySelector('#cw_comfort').value;
			var trunk = modal.querySelector('#cw_trunk').value;
			var gear = getGroupValue(modal, 'gear')[0] || 'לא משנה';
			var fuel = getGroupValue(modal, 'fuel').join(', ') || 'לא צוין';
			var hand = getGroupValue(modal, 'hand')[0] || 'לא משנה';
			var region = modal.querySelector('#cw_region').value || 'לא צוין';
			var notes = modal.querySelector('#cw_notes').value.trim();

			var content = '### מחפש/ת רכב - פרטים מלאים\n\n';
			content += '| שדה | ערך |\n|---|---|\n';
			content += '| תקציב | עד ' + budget + ' ש"ח |\n';
			content += '| ייעוד עיקרי | ' + purpose + ' |\n';
			content += '| מספר נוסעים | ' + passengers + ' |\n';
			content += '| נסועה שנתית | ' + mileage + ' ק"מ |\n';
			content += '| חשיבות חיסכון בדלק | ' + econ + '/5 |\n';
			content += '| חשיבות כוח/עוצמה | ' + power + '/5 |\n';
			content += '| חשיבות אמינות | ' + reliab + '/5 |\n';
			content += '| חשיבות נוחות | ' + comfort + '/5 |\n';
			content += '| חשיבות גודל מטען | ' + trunk + '/5 |\n';
			content += '| גיר | ' + gear + ' |\n';
			content += '| סוג הנעה | ' + fuel + ' |\n';
			content += '| יד | ' + hand + ' |\n';
			content += '| אזור | ' + region + ' |\n';
			if (notes) content += '\n**הערות נוספות:** ' + notes + '\n';
			content += '\n---\n_פורסם באמצעות טופס "עזרה חכמה בקניית רכב"_';

			var title = 'מחפש/ת רכב - תקציב עד ' + budget + ' ש"ח';

			closeModal();

			// זו הקריאה המרכזית - משתמשת בפונקציה המובנית של NodeBB עצמו.
			// זה פותח את חלון הכתיבה הרגיל, ממולא מראש, בלי לגעת ב-API בעצמנו.
			if (typeof app !== 'undefined' && typeof app.newTopic === 'function') {
				app.newTopic({ cid: CATEGORY_ID, title: title, body: content });
			} else {
				alert('שגיאה: לא נמצאה פונקציית הפרסום של הפורום. נסו לרענן את הדף.');
			}
		});
	}

	function ensureButton() {
		var onTargetCategory = window.ajaxify && window.ajaxify.data &&
			String(window.ajaxify.data.cid) === String(CATEGORY_ID);

		var isAdmin = typeof app !== 'undefined' && app.user && app.user.isAdmin;
		var visibleToMe = !ADMIN_ONLY_BETA || isAdmin;

		var existing = document.getElementById(BTN_ID);
		if (!onTargetCategory || !visibleToMe) {
			if (existing) existing.remove();
			return;
		}
		if (existing) return;

		injectStyles();
		var btn = document.createElement('button');
		btn.id = BTN_ID;
		btn.type = 'button';
		btn.textContent = ADMIN_ONLY_BETA ? '🚗 עזרה בקניית רכב (בטא - רק אתה רואה)' : '🚗 עזרה בקניית רכב';
		btn.addEventListener('click', openWizard);
		document.body.appendChild(btn);
	}

	// NodeBB טוען דפים דרך ajaxify בלי רענון מלא - צריך להאזין לאירוע הזה
	$(window).on('action:ajaxify.end', ensureButton);
	$(document).ready(ensureButton);
})();
