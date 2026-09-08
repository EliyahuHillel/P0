/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (מדביקים מתחת לקוד הקיים - זה בסדר גמור שיש כמה סקריפטים ב-Custom JS).
 *
 * דורש שהפלאגין nodebb-plugin-topic-card-styles מותקן ופעיל בשרת - הוא זה
 * ששומר איזה עיצוב נבחר לכל נושא, ומחזיר את הנתונים (כותרת/תמונות/סטטיסטיקות)
 * לעיצובים שדורשים אותם.
 *
 * מה זה עושה:
 * 1. בכל עמוד רשימת נושאים (נושאים אחרונים/קטגוריה/לא נקראו וכו') - כל שורת
 *    נושא עוטפת את עצמה ב"עטיפה" (tcs-row-wrapper) בלי לשנות אותה.
 * 2. למנהלים בלבד - קבוע על כל שורה מופיע תפריט נגלל קטן "עיצוב שורה"
 *    עם רשימת העיצובים הזמינים (STYLES למטה - כרגע רק "רגיל" ו"מבחן דרכים").
 *    בחירה שומרת בשרת מיידית ומעדכנת את התצוגה, בלי רענון עמוד.
 * 3. לנושא שנבחר לו עיצוב "מבחן דרכים" - השורה הרגילה של NodeBB מוסתרת
 *    (לא נמחקת - כדי שאפשר יהיה לחזור ל"רגיל" בלי לרענן), ובמקומה מופיע
 *    כרטיס גדול ומעוצב: תמונה אחת גדולה או שתיים (אחת גדולה + אחת קטנה
 *    בצד, אותו מלבן) שנשלפות אוטומטית מהנושא, כותרת יפה, ושלושה "ריבועים"
 *    סטטיסטיקה (צפיות/פוסטים/הצבעות) בשורה אחת למטה - בהשראת אותם ריבועים
 *    שכבר קיימים היום בשורות הרגילות, רק מסודרים אחרת ובתוך הכרטיס עצמו.
 *    כל מי שגולש רואה את הכרטיס הזה, לא רק מנהלים.
 */
(function () {
	'use strict';

	// רשימת העיצובים הזמינים - '' = ברירת מחדל/שורה רגילה. כדי להוסיף עיצוב
	// חדש בעתיד: מוסיפים כאן { id, label } *וגם* ב-KNOWN_STYLES בשרת
	// (library.js), ומטמיעים את הציור בפועל בפונקציה renderCard למטה לפי
	// ה-id החדש - ואז מפרסמים מחדש (npm publish + Custom JS).
	var STYLES = [
		{ id: '', label: 'רגיל (ברירת מחדל)' },
		{ id: 'driving-test', label: 'מבחן דרכים' },
	];

	var STYLE_ID = 'tcs-style';

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

	// ============ עיצוב (CSS) ============

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '.tcs-row-wrapper{position:relative;}'
			// תפריט בחירת עיצוב - קבוע על כל שורה, למנהלים בלבד. עדין ובהיר,
			// בלי אייקונים צבעוניים - טקסט פשוט וברור.
			+ '.tcs-admin-bar{position:absolute;top:-11px;right:10px;z-index:6;display:inline-flex;'
			+ 'align-items:center;gap:7px;background:#fff;color:#5b5545;padding:4px 10px 4px 6px;'
			+ 'border:1px solid #e5e0d3;border-radius:14px;font-family:Rubik,Arial,sans-serif;font-size:11px;'
			+ 'box-shadow:0 3px 9px rgba(30,25,10,.1);}'
			+ '.tcs-admin-bar select{font-family:inherit;font-size:11px;border:1px solid #e5e0d3;'
			+ 'background:#faf8f3;color:#332f28;border-radius:8px;padding:3px 6px;cursor:pointer;}'
			// כרטיס "מבחן דרכים" - עיצוב בהיר, מכובד: לבן/קרם, מסגרת דקה, גוון
			// זהב-ברונזה עדין לפרטי המותג (תג/מספרים) במקום צהוב בוהק על רקע
			// כהה. באותו רוחב בדיוק כמו כל שורה אחרת ברשימה (הכרטיס יושב
			// באותו container בדיוק כמו השורה המקורית שהוא מחליף) - לא רחב יותר.
			+ '.tcs-card{display:block;width:100%;max-width:100%;box-sizing:border-box;'
			+ 'text-decoration:none;color:inherit;font-family:Rubik,Arial,sans-serif;direction:rtl;'
			+ 'border-radius:14px;overflow:hidden;background:#fff;border:1px solid #e9e3d8;'
			+ 'box-shadow:0 3px 14px rgba(40,32,10,.06);'
			+ 'transition:box-shadow .18s ease,border-color .18s ease;margin:6px 0;}'
			+ '.tcs-card:hover{box-shadow:0 10px 26px rgba(40,32,10,.12);border-color:#ddd4bf;}'
			+ '.tcs-card-badge{position:absolute;top:12px;right:12px;background:#fff;color:#8a6d2f;'
			+ 'font-weight:700;font-size:11px;padding:4px 12px;border-radius:12px;z-index:1;'
			+ 'border:1px solid #e2d3a8;letter-spacing:.01em;}'
			+ '.tcs-images{position:relative;width:100%;height:190px;display:flex;gap:2px;background:#f3efe4;}'
			+ '.tcs-img-main,.tcs-img-side{background-size:cover;background-position:center;background-color:#efeadc;}'
			+ '.tcs-images-one .tcs-img-main{width:100%;height:100%;}'
			+ '.tcs-images-two .tcs-img-main{width:66%;height:100%;}'
			+ '.tcs-images-two .tcs-img-side{width:34%;height:100%;}'
			+ '.tcs-body{padding:16px 18px 14px;}'
			+ '.tcs-title{font-family:"Frank Ruhl Libre",serif;font-size:18.5px;font-weight:700;color:#28241c;'
			+ 'line-height:1.5;margin-bottom:14px;}'
			+ '.tcs-stats{display:flex;gap:8px;}'
			+ '.tcs-stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;'
			+ 'background:#faf8f3;border:1px solid #ece6d6;border-radius:7px;padding:8px 4px 7px;}'
			+ '.tcs-stat-value{font-size:16px;font-weight:800;color:#8a6d2f;line-height:1.1;}'
			+ '.tcs-stat-label{font-size:10.5px;color:#948c73;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	// ============ בניית כרטיס "מבחן דרכים" ============

	function statTileHTML(value, label) {
		return '<div class="tcs-stat"><span class="tcs-stat-value">' + escapeHtml(String(value || 0)) + '</span>'
			+ '<span class="tcs-stat-label">' + escapeHtml(label) + '</span></div>';
	}

	function encodeCssUrl(url) {
		return String(url).replace(/'/g, '%27').replace(/"/g, '%22');
	}

	function drivingTestCardHTML(rowData) {
		var images = rowData.images || [];
		var badgeHtml = '<div class="tcs-card-badge">מבחן דרכים</div>';
		var imagesHtml;
		// התג מוזרק *בתוך* תיבת התמונות (לא כאח שלה) - כך שהוא תמיד יושב
		// צמוד לפינה שלה, לא משנה מה גובה שאר הכרטיס.
		if (images.length >= 2) {
			imagesHtml = '<div class="tcs-images tcs-images-two">'
				+ '<div class="tcs-img-main" style="background-image:url(\'' + encodeCssUrl(images[0]) + '\')"></div>'
				+ '<div class="tcs-img-side" style="background-image:url(\'' + encodeCssUrl(images[1]) + '\')"></div>'
				+ badgeHtml
				+ '</div>';
		} else if (images.length === 1) {
			imagesHtml = '<div class="tcs-images tcs-images-one">'
				+ '<div class="tcs-img-main" style="background-image:url(\'' + encodeCssUrl(images[0]) + '\')"></div>'
				+ badgeHtml
				+ '</div>';
		} else {
			// אין תמונה בכלל - שטח קרם ריק ושקט, בלי אייקון/אמוג'י ממלא מקום.
			imagesHtml = '<div class="tcs-images tcs-images-none">' + badgeHtml + '</div>';
		}

		return imagesHtml
			+ '<div class="tcs-body">'
			+ '<div class="tcs-title">' + escapeHtml(rowData.title || '') + '</div>'
			+ '<div class="tcs-stats">'
			+ statTileHTML(rowData.views, 'צפיות')
			+ statTileHTML(rowData.posts, 'פוסטים')
			+ statTileHTML(rowData.votes, 'הצבעות')
			+ '</div>'
			+ '</div>';
	}

	// עתידית: כשמוסיפים עיצוב חדש, מוסיפים כאן ענף נוסף (לפי style.id) שבונה
	// את ה-HTML שלו, ומחזירים null לעיצוב שאין עדיין לו מימוש.
	function renderCard(style, rowData) {
		if (style === 'driving-test') return drivingTestCardHTML(rowData);
		return null;
	}

	// ============ עדכון שורה ============

	function applyRowData(wrapper, tid, rowData) {
		var style = (rowData && rowData.style) || '';
		var row = wrapper.querySelector('[data-tid="' + tid + '"]');
		var card = wrapper.querySelector('.tcs-card');
		var html = style ? renderCard(style, rowData) : null;

		if (html) {
			if (row) row.style.display = 'none';
			if (!card) {
				card = document.createElement('a');
				card.className = 'tcs-card';
				wrapper.appendChild(card);
			}
			card.href = rowData.url || '#';
			card.innerHTML = html;
		} else {
			if (row) row.style.display = '';
			if (card) card.remove();
		}

		updateAdminBar(wrapper, tid, style);
	}

	function updateAdminBar(wrapper, tid, currentStyle) {
		if (!isAdmin()) return;
		var existing = wrapper.querySelector('.tcs-admin-bar');
		if (existing) {
			existing.querySelector('select').value = currentStyle;
			return;
		}

		var bar = document.createElement('div');
		bar.className = 'tcs-admin-bar';
		bar.innerHTML = '<span>עיצוב שורה</span>'
			+ '<select>' + STYLES.map(function (s) {
				return '<option value="' + escapeHtml(s.id) + '"' + (s.id === currentStyle ? ' selected' : '') + '>'
					+ escapeHtml(s.label) + '</option>';
			}).join('') + '</select>';
		wrapper.insertBefore(bar, wrapper.firstChild);

		// עוצר בעד/click/mousedown - כדי שפתיחת/שינוי התפריט לא "ידלוף" ללחיצה
		// על השורה עצמה שמתחתיו (שהייתה מנווטת לנושא).
		['click', 'mousedown'].forEach(function (evt) {
			bar.addEventListener(evt, function (e) { e.stopPropagation(); });
		});

		bar.querySelector('select').addEventListener('change', function () {
			var newStyle = this.value;
			var socket = getSocket();
			if (!socket) return;
			socket.emit('plugins.topicCardStyles.setStyle', { tid: tid, style: newStyle }, function (err) {
				if (err) {
					window.alert('שגיאה בשמירת העיצוב - נסו שוב.');
					return;
				}
				if (newStyle) {
					// עיצוב שדורש נתונים (כותרת/תמונות/סטטיסטיקות) - שולפים
					// אותם עכשיו, רק לשורה הזו.
					socket.emit('plugins.topicCardStyles.getRowData', { tids: [tid] }, function (err2, dataByTid) {
						if (err2 || !dataByTid) return;
						applyRowData(wrapper, tid, dataByTid[tid] || { style: newStyle });
					});
				} else {
					applyRowData(wrapper, tid, { style: '' });
				}
			});
		});
	}

	// ============ סריקת שורות ============

	function scanRows() {
		var rows = document.querySelectorAll(
			'[component="category/topic"]:not([data-tcs-enhanced]), li[data-tid]:not([data-tcs-enhanced])'
		);
		if (!rows.length) return;

		var tids = [];
		rows.forEach(function (row) {
			var tid = row.getAttribute('data-tid');
			if (!tid) return;
			row.setAttribute('data-tcs-enhanced', '1');

			var wrapper = document.createElement('div');
			wrapper.className = 'tcs-row-wrapper';
			wrapper.setAttribute('data-tcs-wrapper-for', tid);
			row.parentNode.insertBefore(wrapper, row);
			wrapper.appendChild(row);

			// תפריט הבחירה למנהל מוצג *מיד*, בלי לחכות לתשובת השרת - כך שהוא
			// תמיד נראה (ואפשר לדעת שהסקריפט בכלל רץ) גם אם קריאת השרת למטה
			// עוד לא הצליחה (למשל: הפלאגין בשרת עוד לא הותקן/הופעל). התפריט
			// עצמו יתעדכן לערך האמיתי ברגע שהתשובה מגיעה.
			updateAdminBar(wrapper, tid, '');

			tids.push(tid);
		});

		if (!tids.length) return;
		var socket = getSocket();
		if (!socket) return;

		// קריאה אחת מרוכזת לכל השורות החדשות שהתגלו כרגע בעמוד (לא קריאה
		// נפרדת לכל שורה) - כדי לא להכביד גם בעמודים עם הרבה נושאים.
		socket.emit('plugins.topicCardStyles.getRowData', { tids: tids }, function (err, dataByTid) {
			if (err || !dataByTid) {
				// לא מסתירים כלום - תפריט המנהל כבר מוצג מלמעלה. רק מתעדים
				// לקונסול כדי שאפשר יהיה לאבחן (למשל: הפלאגין בשרת לא פעיל).
				if (err) window.console && console.error('[topic-card-styles] getRowData failed:', err);
				return;
			}
			tids.forEach(function (tid) {
				var wrapper = document.querySelector('.tcs-row-wrapper[data-tcs-wrapper-for="' + tid + '"]');
				if (wrapper) applyRowData(wrapper, tid, dataByTid[tid] || { style: '' });
			});
		});
	}

	function onPageChange() {
		injectStyles();
		scanRows();
	}

	if (window.$) {
		// action:ajaxify.end - מעבר עמוד רגיל. action:topics.loaded - טעינת
		// עוד שורות בגלילה אינסופית, בלי מעבר עמוד מלא.
		$(window).on('action:ajaxify.end action:topics.loaded', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
