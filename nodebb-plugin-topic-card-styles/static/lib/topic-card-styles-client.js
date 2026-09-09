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
 * 2. למנהלים בלבד - מתווסף לתפריט "כלי נושא" הקיים (זה שנפתח כשמסמנים
 *    נושאים בריבועי הבחירה שלהם, ליד "תיוג נושא" וכו') פריט חדש: "עיצוב:
 *    מבחן דרכים". לוחצים עליו כשיש נושאים מסומנים - זה מחיל "מבחן דרכים"
 *    על כולם; לוחצים שוב כשכולם כבר במצב הזה - זה מחזיר את כולם ל"רגיל"
 *    (טוגל). שומר בשרת מיידית ומעדכן את התצוגה, בלי רענון עמוד.
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
			+ '.tcs-title-bar{padding:15px 20px 13px;text-align:center;border-bottom:1px solid #f1ede2;}'
			+ '.tcs-title{font-family:"Frank Ruhl Libre",serif;font-size:18.5px;font-weight:700;color:#28241c;'
			+ 'line-height:1.5;}'
			+ '.tcs-body{padding:16px 18px 14px;}'
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

		// הכותרת עכשיו למעלה וממורכזת, מעל התמונה - לא בגוף שמתחת לה.
		return '<div class="tcs-title-bar"><div class="tcs-title">' + escapeHtml(rowData.title || '') + '</div></div>'
			+ imagesHtml
			+ '<div class="tcs-body">'
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

	// tid -> { wrapper, row } - מחזיקים רפרנס *ישיר* לאלמנטים האמיתיים שכבר
	// עיבדנו, במקום לחפש אותם מחדש ב-DOM לפי data-tid בכל פעם. זה קריטי:
	// בעמודי קטגוריה גילינו שחיפוש מחדש (wrapper.querySelector) לפעמים תפס
	// אלמנט לא נכון (כנראה מבנה DOM שונה מעמוד "נושאים אחרונים"), וכתוצאה
	// מזה השורה המקורית לא הוסתרה בפועל - "כפילות" מול הכרטיס החדש.
	// עם רפרנס ישיר זו כבר לא יכולה להיות הבעיה.
	var rowRegistry = {};

	function applyRowData(tid, rowData) {
		var entry = rowRegistry[tid];
		if (!entry) return;
		var wrapper = entry.wrapper;
		var row = entry.row;
		var style = (rowData && rowData.style) || '';
		var card = wrapper.querySelector('.tcs-card');
		var html = style ? renderCard(style, rowData) : null;

		if (html) {
			// setProperty עם 'important' ולא סתם row.style.display='none' - כי
			// לפי מה שראינו בפועל, ל-CSS של התבנית יש display עם !important על
			// שורת הנושא (כנראה חלק מהגדרת ה-flex/grid שלה), וזה מנצח style
			// רגיל inline. !important ב-inline מנצח גם !important ב-stylesheet.
			row.style.setProperty('display', 'none', 'important');
			if (!card) {
				card = document.createElement('a');
				card.className = 'tcs-card';
				wrapper.appendChild(card);
			}
			card.href = rowData.url || '#';
			card.innerHTML = html;
		} else {
			row.style.removeProperty('display');
			if (card) card.remove();
		}
	}

	// רענון "רגעי" לשורה בודדת (נקרא אחרי שינוי עיצוב מתפריט "כלי נושא") -
	// שולף נתונים טריים ומעדכן את התצוגה שלה מיידית אם היא נמצאת כרגע במסך.
	function refreshRowIfVisible(tid) {
		if (!rowRegistry[tid]) return;
		var socket = getSocket();
		if (!socket) return;
		socket.emit('plugins.topicCardStyles.getRowData', { tids: [tid] }, function (err, dataByTid) {
			if (err || !dataByTid) return;
			applyRowData(tid, dataByTid[tid] || { style: '' });
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
			row.parentNode.insertBefore(wrapper, row);
			wrapper.appendChild(row);

			rowRegistry[tid] = { wrapper: wrapper, row: row };
			tids.push(tid);
		});

		if (!tids.length) return;
		var socket = getSocket();
		if (!socket) return;

		// קריאה אחת מרוכזת לכל השורות החדשות שהתגלו כרגע בעמוד (לא קריאה
		// נפרדת לכל שורה) - כדי לא להכביד גם בעמודים עם הרבה נושאים.
		socket.emit('plugins.topicCardStyles.getRowData', { tids: tids }, function (err, dataByTid) {
			if (err || !dataByTid) {
				if (err) window.console && console.error('[topic-card-styles] getRowData failed:', err);
				return;
			}
			tids.forEach(function (tid) {
				applyRowData(tid, dataByTid[tid] || { style: '' });
			});
		});
	}

	// ============ שילוב בתפריט "כלי נושא" (בחירה מרובה בעמודי רשימה) ============

	// קורא ישירות מה-DOM אילו נושאים מסומנים כרגע ע"י ריבועי הבחירה
	// (component="topic/select") - בלי להסתמך על מנגנון פנימי כלשהו של
	// NodeBB לניהול "מי מסומן" (לא ידוע לנו בדיוק איך זה עובד מבפנים),
	// פשוט קוראים את מצב האייקונים בפועל ברגע הלחיצה על הפריט שלנו בתפריט.
	function getSelectedTids() {
		var tids = [];
		document.querySelectorAll('[component="topic/select"]').forEach(function (icon) {
			if ((icon.className || '').indexOf('check') === -1) return; // ריבוע ריק = לא מסומן
			var row = icon.closest('[data-tid]');
			if (row) tids.push(row.getAttribute('data-tid'));
		});
		return tids;
	}

	// טוגל: אם *כל* הנושאים המסומנים כבר על "מבחן דרכים" - מחזירים את כולם
	// ל"רגיל"; אחרת מחילים "מבחן דרכים" על כולם (גם אם חלקם כבר היו).
	function applyDrivingTestToSelected() {
		var tids = getSelectedTids();
		if (!tids.length) {
			window.alert('בחרו קודם נושא אחד או יותר (ריבוע הבחירה ליד כל שורה) ואז נסו שוב.');
			return;
		}
		var socket = getSocket();
		if (!socket) return;

		socket.emit('plugins.topicCardStyles.getRowData', { tids: tids }, function (err, dataByTid) {
			if (err || !dataByTid) return;
			var allAlreadySet = tids.every(function (tid) {
				return dataByTid[tid] && dataByTid[tid].style === 'driving-test';
			});
			var newStyle = allAlreadySet ? '' : 'driving-test';

			tids.forEach(function (tid) {
				socket.emit('plugins.topicCardStyles.setStyle', { tid: tid, style: newStyle }, function (err2) {
					if (err2) return;
					refreshRowIfVisible(tid);
				});
			});
		});
	}

	// מוסיף לתפריט "כלי נושא" (נפתח מעל שורות מסומנות בעמודי רשימה) פריט
	// חדש - "עיצוב: מבחן דרכים" - ליד פריטים קיימים כמו "תיוג נושא". מזהים
	// את התפריט לפי פריט קיים שכבר נמצא בו (topic/tag), ומוסיפים את שלנו
	// כ-<li> אח שלו, באותו עיצוב בדיוק. למנהלים בלבד (כמו שאר כלי הנושא).
	function injectTopicToolsMenuItem() {
		if (!isAdmin()) return;
		var tagItems = document.querySelectorAll('[component="topic/tag"]:not([data-tcs-menu-scanned])');
		tagItems.forEach(function (tagItem) {
			tagItem.setAttribute('data-tcs-menu-scanned', '1');
			var existingLi = tagItem.closest('li');
			if (!existingLi || !existingLi.parentNode) return;

			var li = document.createElement('li');
			var a = document.createElement('a');
			a.href = '#';
			a.setAttribute('role', 'menuitem');
			a.className = 'dropdown-item rounded-1 d-flex align-items-center gap-2';
			a.innerHTML = '<i class="fa fa-fw fa-paint-brush text-secondary"></i> עיצוב: מבחן דרכים';
			li.appendChild(a);
			existingLi.parentNode.insertBefore(li, existingLi.nextSibling);

			a.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				applyDrivingTestToSelected();
			});
		});
	}

	function onPageChange() {
		injectStyles();
		scanRows();
		injectTopicToolsMenuItem();
	}

	if (window.$) {
		// action:ajaxify.end - מעבר עמוד רגיל. action:topics.loaded - טעינת
		// עוד שורות בגלילה אינסופית, בלי מעבר עמוד מלא.
		$(window).on('action:ajaxify.end action:topics.loaded', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
