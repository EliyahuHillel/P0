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
 *    כל מי שגולש רואה את הכרטיס הזה, לא רק מנהלים. לכרטיס יש גם ריבוע
 *    בחירה משלו (בפינה) - כי השורה המקורית עם ריבוע הבחירה שלה מוסתרת,
 *    כך שאפשר עדיין לסמן נושא שכבר במצב "מבחן דרכים" ולהחזיר אותו ל"רגיל"
 *    דרך "כלי נושא", בדיוק כמו נושא רגיל.
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
				// מסתירים את השורה המקורית ע"י class עם !important בגיליון
				// הסגנונות שלנו - לא ע"י style inline. גילינו שמשהו (כנראה
				// NodeBB עצמו) לפעמים קובע row.style.display='none' *בלי*
				// !important אחרי ההסתרה שלנו, מה שהשאיר את הערך "none" אבל
				// ביטל את העדיפות שלו - וכלל CSS אחר עם !important ניצח בפועל
				// (השורה נשארה גלויה בפועל למרות שה-inline "אמר" none). לפי
				// כללי ה-CSS, inline *לא-important* אף פעם לא מנצח stylesheet
				// *עם* important - אז class עם !important חסין לחלוטין מהבעיה
				// הזו, בלי צורך לבדוק/לתקן שוב ושוב (מה שגרם לקפיצות גלילה
				// בעמוד קטגוריה שבו כל הנושאים מעוצבים בו-זמנית).
				+ '.tcs-force-hidden{display:none!important;}'
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
			+ '.tcs-stat-label{font-size:10.5px;color:#948c73;}'
			// ריבוע הבחירה על הכרטיס - יושב מעל הכרטיס (לא בתוך ה-<a> שלו,
			// כדי שלחיצה עליו לא תפעיל את הניווט של הכרטיס), בפינה הנגדית
			// לתג "מבחן דרכים".
			+ '.tcs-select-icon{position:absolute;top:10px;left:10px;z-index:2;background:#fff;'
			+ 'border-radius:6px;width:26px;height:26px;display:flex;align-items:center;'
			+ 'justify-content:center;font-size:15px;color:#8a6d2f;cursor:pointer;'
			+ 'box-shadow:0 1px 4px rgba(40,32,10,.15);}';
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

	// ויתרנו לגמרי על "זכרון" של רפרנסים ל-DOM (רישום tid -> אלמנטים)
	// בין קריאות - זה מה שגרם לבאגים הקשים ביותר עד עכשיו: רפרנס שנשמר
	// יכול "להתיישן" (האלמנט כבר לא ב-DOM החי, למשל אחרי מעבר עמוד ב-SPA),
	// ותשובה א-סינכרונית מהשרת (getRowData) יכולה להגיע אחרי שהרישום כבר
	// נוקה/השתנה על ידי קריאה אחרת - מה שגרם לתקלה לסירוגין ("לפעמים מעוצב
	// לפעמים לא"). הפתרון הנכון: **בלי שום זכרון** - בכל פעם שצריך לעדכן
	// שורה, שואלים ישירות את ה-DOM החי "מה יש עכשיו בפועל עם ה-tid הזה"
	// (document.querySelectorAll), ולא סומכים על שום דבר ששמרנו קודם.
	// כך אין מה "שיתיישן" - אלמנט שכבר לא בעמוד פשוט לא יחזור מהשאילתה.
	function wrappersForTid(tid) {
		return Array.prototype.slice.call(
			document.querySelectorAll('.tcs-row-wrapper[data-tid="' + tid + '"]')
		);
	}

	// מסתירים ע"י class (tcs-force-hidden, מוגדר ב-injectStyles עם
	// !important) ולא ע"י style inline. ניסינו קודם עם style inline
	// (+ MutationObserver + בדיקה תקופתית שמתקנים את זה שוב ושוב) כי גילינו
	// שמשהו (כנראה NodeBB עצמו) קובע row.style.display='none' *בלי*
	// !important אחרי ההסתרה שלנו - מה שמנצח את ה-!important שקבענו כי זה
	// דורס את כל התכונה display מחדש. אבל התיקון ההוא (לתקן שוב ושוב) גרם
	// לבעיה חדשה - קפיצות גלילה בעמוד קטגוריה שבו הרבה נושאים מעוצבים
	// בו-זמנית (כל תיקון היה משנה display שוב ושוב). הפתרון הנכון: class עם
	// !important *בגיליון הסגנונות* - לפי כללי ה-CSS, style inline לא-important
	// אף פעם לא מנצח stylesheet rule עם important, לא משנה מה סדר הפעולות -
	// כך שאין יותר "קרב" בכלל, ואין צורך לבדוק/לתקן שוב ושוב.
	function hideRow(row) {
		row.classList.add('tcs-force-hidden');
	}

	function showRow(row) {
		row.classList.remove('tcs-force-hidden');
	}

	function applyRowData(tid, rowData) {
		var wrappers = wrappersForTid(tid);
		if (!wrappers.length) return;
		var style = (rowData && rowData.style) || '';
		var html = style ? renderCard(style, rowData) : null;

		wrappers.forEach(function (wrapper, idx) {
			var row = wrapper.querySelector('[component="category/topic"], li[data-tid]');
			if (!row) return;
			var card = wrapper.querySelector('.tcs-card');
			var selectIcon = wrapper.querySelector('.tcs-select-icon');

			if (html) {
				hideRow(row);
				// רק בעותק הראשון בפועל מציגים כרטיס - שאר העותקים (אם יש,
				// למשל תצוגה כפולה בעמוד קטגוריה) פשוט מוסתרים לגמרי, כדי
				// שהנושא לא יופיע פעמיים.
				if (idx === 0) {
					if (!card) {
						card = document.createElement('a');
						card.className = 'tcs-card';
						wrapper.appendChild(card);
					}
					card.href = rowData.url || '#';
					card.innerHTML = html;

					if (!selectIcon) {
						selectIcon = document.createElement('i');
						selectIcon.setAttribute('component', 'topic/select');
						selectIcon.className = 'fa fa-square-o tcs-select-icon';
						wrapper.appendChild(selectIcon);
					}
				} else if (card) {
					card.remove();
					if (selectIcon) selectIcon.remove();
				}
			} else {
				showRow(row);
				if (card) card.remove();
				if (selectIcon) selectIcon.remove();
			}
		});
	}

	// רענון "רגעי" לשורה בודדת (נקרא אחרי שינוי עיצוב מתפריט "כלי נושא") -
	// שולף נתונים טריים ומעדכן את התצוגה שלה מיידית אם היא נמצאת כרגע במסך.
	function refreshRowIfVisible(tid) {
		if (!wrappersForTid(tid).length) return;
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
			// ה-data-tid על העטיפה עצמה (לא רק על השורה שבתוכה) - כך שריבוע
			// הבחירה שלנו על הכרטיס (ראו tcs-select-icon), שהוא אח של השורה
			// ולא צאצא שלה, עדיין נמצא ע"י getSelectedTids באמצעות
			// icon.closest('[data-tid]').
			wrapper.setAttribute('data-tid', tid);
			row.parentNode.insertBefore(wrapper, row);
			wrapper.appendChild(row);

			if (tids.indexOf(tid) === -1) tids.push(tid);
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

	// ריבוע הבחירה שלנו (tcs-select-icon) נוצר ונהרס דינמית (רק כשיש כרטיס
	// "מבחן דרכים" מוצג), אז מאזינים ל-click פעם אחת ברמת ה-document
	// (delegation) במקום לרשום מאזין חדש בכל פעם שנוצר ריבוע. לא צריך
	// stopPropagation בשביל למנוע ניווט - הריבוע הוא אח של ה-<a class="tcs-card">,
	// לא צאצא שלו, כך שממילא אין לחיצה "דרך" הכרטיס.
	document.addEventListener('click', function (e) {
		var icon = e.target.closest && e.target.closest('.tcs-select-icon');
		if (!icon) return;
		e.preventDefault();
		e.stopPropagation();
		if ((icon.className || '').indexOf('check') === -1) {
			icon.className = 'fa fa-check-square-o tcs-select-icon';
		} else {
			icon.className = 'fa fa-square-o tcs-select-icon';
		}
	});

	function onPageChange() {
		injectStyles();
		scanRows();
		injectTopicToolsMenuItem();
	}

	// גילינו (לפי דיווח שגם MutationObserver על ה-style/class של השורה
	// הישנה לא פתר את הכפילות, וגם שמספר הצפיות המוצג באותו נושא עלה תוך
	// כדי שהעמוד פתוח - 251 ואז 253) שהפורום מעדכן שורות "בזמן אמת" (חי,
	// כשהעמוד כבר פתוח, לא רק בטעינה/ניווט). כנראה NodeBB לא רק *משנה*
	// את השורה הקיימת בעדכון כזה, אלא ממש *מחליף* אותה (מוחק ומכניס
	// אלמנט חדש לגמרי במקומה) - וזה בדיוק למה observer שצפה באלמנט הישן
	// לא תפס כלום: האלמנט הישן פשוט הוצא מה-DOM, וזה שהתחלף בו הוא חדש
	// ולא מעובד. הפתרון: לצפות בכל הדף (document.body) לכל הוספת אלמנט
	// חדש, ולסרוק שוב (scanRows) בכל פעם שנוסף אלמנט שנראה כמו שורת נושא -
	// לא מסתמכים יותר רק על אירועי ניווט של NodeBB (action:ajaxify.end/
	// action:topics.loaded), שלא קורים בעדכון חי כזה.
	var scanDebounceTimer = null;
	function scheduleScan() {
		if (scanDebounceTimer) return;
		scanDebounceTimer = setTimeout(function () {
			scanDebounceTimer = null;
			scanRows();
			injectTopicToolsMenuItem();
		}, 150);
	}

	function nodeLooksLikeRow(node) {
		if (node.nodeType !== 1) return false;
		if (node.matches && (node.matches('[component="category/topic"]') || node.matches('li[data-tid]'))) {
			return true;
		}
		return !!(node.querySelector && node.querySelector('[component="category/topic"], li[data-tid]'));
	}

	var bodyObserver = new MutationObserver(function (mutations) {
		for (var m = 0; m < mutations.length; m++) {
			var added = mutations[m].addedNodes;
			for (var n = 0; n < added.length; n++) {
				if (nodeLooksLikeRow(added[n])) {
					scheduleScan();
					return;
				}
			}
		}
	});
	bodyObserver.observe(document.body, { childList: true, subtree: true });

	if (window.$) {
		// action:ajaxify.end - מעבר עמוד רגיל. action:topics.loaded - טעינת
		// עוד שורות בגלילה אינסופית, בלי מעבר עמוד מלא. בלי שום זכרון
		// (rowRegistry) שצריך לאפס בין השניים - scanRows מדלג ממילא על
		// שורות שכבר מעובדות (data-tcs-enhanced), ו-applyRowData שואל תמיד
		// את ה-DOM החי ישירות - כך שאין הבדל אמיתי בין שני סוגי האירועים.
		$(window).on('action:ajaxify.end action:topics.loaded', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
