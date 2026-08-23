/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (לוודא שה-checkbox "Enable Custom JS" מסומן, ואז לשמור)
 *
 * מה זה עושה:
 * בכל פעם שנפתח חלון כתיבת פוסט כלשהו (נושא חדש/תגובה, בכל קטגוריה) מופיע
 * כפתור קטן וצדדי - "עזרה בקניית רכב" - שלא מכסה שום דבר. הוא צמוד לחלון
 * הכתיבה עצמו, ונעלם אוטומטית כשסוגרים אותו (כי הוא חלק מה-DOM של החלון).
 * לחיצה עליו פותחת את הטופס שלנו; בסיום נבנה כותרת + "כרטיסיית סיכום"
 * מעוצבת (HTML/CSS מוטבע), ונקרא ל-app.newTopic() המובנית של NodeBB - זו
 * בדיוק הפונקציה שכפתור "פוסט חדש" הרגיל קורא לה, כך שנפתח חלון כתיבה חדש
 * וממולא מראש בקטגוריית "עסקאות רכב". אין קריאת API עצמאית, אין CORS, אין
 * טיפול ב-cookie/CSRF - הכל דרך NodeBB עצמו.
 */
(function () {
	'use strict';

	// קטגוריית "עסקאות רכב" - https://rechavimzelaze.ovh/category/82/עסקאות-רכב
	var CATEGORY_ID = 82;

	// מצב בטא: כל עוד true, הכפתור מוצג רק למנהלים (app.user.isAdmin) - אף
	// משתמש רגיל לא רואה שום דבר. להחליף ל-false אחרי אישור המנהל הראשי.
	var ADMIN_ONLY_BETA = true;

	var STYLE_ID = 'car-wizard-style';
	var MODAL_ID = 'car-wizard-modal';

	function isAdmin() {
		return typeof app !== 'undefined' && app.user && app.user.isAdmin;
	}

	function visibleToMe() {
		return !ADMIN_ONLY_BETA || isAdmin();
	}

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
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
			+ '<p class="cw-sub">מלאו פעם אחת - נחסוך את כל שאלות ההבהרה בתגובות. הפוסט יפורסם בקטגוריית "עסקאות רכב".</p>'
			+ '<div class="cw-field"><label>תקציב (עד כמה, בש״ח)</label><input type="number" id="cw_budget" placeholder="למשל 60000"></div>'
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

	// שורה בכרטיסיית הסיכום - HTML+CSS מוטבע, לא Markdown
	function summaryRow(label, value) {
		return '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #f1ede6;">'
			+ '<span style="color:#867d6e;font-size:13.5px;white-space:nowrap;">' + label + '</span>'
			+ '<span style="color:#332f28;font-weight:600;font-size:13.5px;text-align:left;">' + value + '</span>'
			+ '</div>';
	}

	function formatBudget(raw) {
		var num = parseInt(raw, 10);
		if (isNaN(num)) return raw;
		return num.toLocaleString('en-US');
	}

	function sectionHeader(text) {
		return '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#a89f8f;font-weight:600;padding:14px 20px 4px;">' + text + '</div>';
	}

	function dotsRow(label, value) {
		var n = parseInt(value, 10) || 0;
		var dots = '';
		for (var i = 1; i <= 5; i++) {
			dots += '<span style="color:' + (i <= n ? '#4f6b57' : '#e9e3d8') + ';font-size:15px;letter-spacing:1px;">●</span>';
		}
		return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f1ede6;">'
			+ '<span style="color:#867d6e;font-size:13.5px;white-space:nowrap;">' + label + '</span>'
			+ '<span>' + dots + '</span>'
			+ '</div>';
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
			var budget = formatBudget(modal.querySelector('#cw_budget').value) || 'לא צוין';
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

			var content = ''
				+ '<div style="border:1px solid #e9e3d8;border-radius:14px;overflow:hidden;font-family:Rubik,Arial,sans-serif;direction:rtl;max-width:480px;">'
				+ '<div style="background:#faf7f2;padding:16px 20px;border-bottom:1px solid #e9e3d8;">'
				+ '<div style="font-family:\'Frank Ruhl Libre\',serif;font-size:19px;font-weight:700;color:#332f28;">מחפש רכב - סיכום דרישות</div>'
				+ '</div>'
				+ '<div style="padding:0 20px;">'
				+ sectionHeader('פרטי בסיס')
				+ summaryRow('תקציב', 'עד ' + budget + ' ש״ח')
				+ summaryRow('ייעוד עיקרי', purpose)
				+ summaryRow('מספר נוסעים', passengers)
				+ summaryRow('נסועה שנתית', mileage + ' ק"מ')

				+ sectionHeader('מה הכי חשוב לי')
				+ dotsRow('חיסכון בדלק', econ)
				+ dotsRow('כוח/עוצמה', power)
				+ dotsRow('אמינות', reliab)
				+ dotsRow('נוחות', comfort)
				+ dotsRow('גודל תא מטען', trunk)

				+ sectionHeader('העדפות נוספות')
				+ summaryRow('גיר', gear)
				+ summaryRow('סוג הנעה', fuel)
				+ summaryRow('יד', hand)
				+ summaryRow('אזור', region)
				+ '</div>'
				+ (notes ? '<div style="padding:12px 20px;font-size:13.5px;color:#332f28;border-top:1px solid #e9e3d8;margin-top:8px;"><b>הערות נוספות:</b> ' + notes + '</div>' : '<div style="height:8px;"></div>')
				+ '<div style="padding:10px 20px;background:#faf7f2;font-size:11px;color:#a89f8f;border-top:1px solid #e9e3d8;">פורסם באמצעות טופס "עזרה חכמה בקניית רכב"</div>'
				+ '</div>';

			var title = 'מחפש רכב - תקציב עד ' + budget + ' ש״ח';

			closeModal();

			if (typeof app !== 'undefined' && typeof app.newTopic === 'function') {
				app.newTopic({ cid: CATEGORY_ID, title: title, body: content });
			} else {
				alert('שגיאה: לא נמצאה פונקציית הפרסום של הפורום. נסו לרענן את הדף.');
			}
		});
	}

	var TOOLBAR_ATTACHED_ATTR = 'data-car-wizard-attached';

	// NodeBB לא תמיד מסיר את חלון הכתיבה מה-DOM כשסוגרים אותו (לפעמים רק
	// מסתיר/ממזער) - אז בודקים גם נראות בפועל, לא רק קיום באלמנטים.
	// (offsetParent מחזיר null עבור אלמנטים עם position:fixed גם כשהם כן
	// מוצגים בפועל - זו תקלה ידועה בדפדפנים, ולכן לא משתמשים בו כאן.)
	function isVisible(el) {
		return !!el && el.getClientRects().length > 0;
	}

	function visibleComposers() {
		return Array.prototype.filter.call(document.querySelectorAll('.composer'), isVisible);
	}

	// מחפשים את כפתור "ביטול" של חלון הכתיבה הזה עצמו (לפי הטקסט שלו, לא
	// לפי class - כדי לא לתלות בשם מדויק שאין לי גישה אליו) ומדמים לחיצה
	// עליו, כדי לסגור אותו לפני שפותחים חלון חדש וממולא - אחרת NodeBB
	// מתמקד בחלון הריק הקיים במקום לפתוח אחד חדש עם הנתונים.
	function discardComposerOf(el) {
		var composerEl = el.closest('.composer');
		if (!composerEl) return;
		var candidates = composerEl.querySelectorAll('a, button');
		for (var i = 0; i < candidates.length; i++) {
			if ((candidates[i].textContent || '').trim() === 'ביטול') {
				candidates[i].click();
				return;
			}
		}
	}

	function buildInlineButton() {
		var span = document.createElement('span');
		span.style.marginInlineStart = '10px';
		span.innerHTML = '<a href="#" style="display:inline-block;padding:4px 12px;border:1px solid #e9e3d8;'
			+ 'border-radius:999px;background:#faf7f2;color:#4f6b57;font-size:12px;font-weight:500;'
			+ 'white-space:nowrap;text-decoration:none;">עזרה בקניית רכב</a>';
		span.querySelector('a').addEventListener('click', function (e) {
			e.preventDefault();
			var btn = e.currentTarget;
			discardComposerOf(btn);
			setTimeout(openWizard, 300);
		});
		return span;
	}

	// שדה התגיות עצמו הוא <input class="ui-autocomplete-input" placeholder="הכנס תגיות...">
	// (jQuery UI autocomplete, לא ספריית tagsinput). מחפשים בכל הדף (לא רק
	// בתוך .composer) כי ייתכן שהשדה לא מקונן בפועל בתוך אלמנט חלון הכתיבה -
	// זה עדיין בטוח כי השדה הזה קיים רק כשחלון כתיבה פתוח בפועל.
	function findTagsInput() {
		var candidates = document.querySelectorAll('input.ui-autocomplete-input');
		for (var i = 0; i < candidates.length; i++) {
			var ph = candidates[i].getAttribute('placeholder') || '';
			if (ph.indexOf('תגי') !== -1) return candidates[i];
		}
		return null;
	}

	// מוסיפים אך ורק בתוך שורת התגיות - בלי שום חלופה במקום אחר.
	// אם השורה לא נמצאת, פשוט לא מוצג כלום (במקום ליפול לתגית צדדית).
	function syncTab() {
		if (!visibleToMe()) return;
		if (visibleComposers().length === 0) return;

		var input = findTagsInput();
		if (!input || !isVisible(input)) return;

		// ה-input גר בתוך <div class="bootstrap-tagsinput"> (יחד עם תיבת
		// הצעות אוטומטיות נסתרת) - מוסיפים בסוף אותו div, לא צמוד ל-input עצמו.
		var container = input.closest('.bootstrap-tagsinput') || input.parentElement;
		if (container.getAttribute(TOOLBAR_ATTACHED_ATTR)) return;
		container.setAttribute(TOOLBAR_ATTACHED_ATTR, '1');
		container.appendChild(buildInlineButton());
	}

	var observer = new MutationObserver(function () {
		syncTab();
	});
	observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

	// בדיקה ראשונית, ליתר ביטחון (למקרה שחלון כתיבה כבר פתוח בטעינת הדף)
	syncTab();
})();
