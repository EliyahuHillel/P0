/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (מדביקים מתחת לקוד הקיים - זה בסדר גמור שיש כמה סקריפטים ב-Custom JS).
 *
 * דורש שהפלאגין nodebb-plugin-aliexpress-preview מותקן ופעיל בשרת - הוא
 * זה ששולף ומטמין בפועל את תקציר המוצר (ראו README.md בתיקיית הפלאגין).
 *
 * מה זה עושה:
 * כל קישור בתוך פוסט שמצביע ל-aliexpress.com (בכל תת-דומיין, למשל
 * he.aliexpress.com) מקבל אוטומטית סמל קטן (זכוכית מגדלת) שמופיע צמוד
 * לקישור, בצד הימני שלו. לחיצה על הסמל (לא על הקישור עצמו - הקישור ממשיך
 * לעבוד כרגיל) פותחת חלונית קטנה עם תמונת המוצר, שמו, ומחירו (אם נמצא).
 * עובד זהה בדיוק במחשב ובנייד, כי זו לחיצה רגילה ולא ריחוף.
 */
(function () {
	'use strict';

	var TOOLTIP_ID = 'aep-tooltip';
	var STYLE_ID = 'aep-preview-style';
	var ICON_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" '
		+ 'stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"></circle>'
		+ '<line x1="20" y1="20" x2="15.5" y2="15.5"></line></svg>';

	var previewCache = {};
	var currentTooltip = null;
	var currentHref = null;
	var currentIcon = null;

	function escapeHtml(str) {
		var div = document.createElement('div');
		div.textContent = str === null || str === undefined ? '' : String(str);
		return div.innerHTML;
	}

	function getSocket() {
		return (typeof window.socket !== 'undefined') ? window.socket : null;
	}

	function isAliexpressLink(href) {
		try {
			var url = new URL(href, window.location.href);
			if (url.protocol !== 'https:') return false;
			var host = url.hostname.toLowerCase();
			return host === 'aliexpress.com' || host.indexOf('.aliexpress.com') === host.length - '.aliexpress.com'.length;
		} catch (e) {
			return false;
		}
	}

	function injectStyles() {
		if (document.getElementById(STYLE_ID)) return;
		var css = ''
			+ '.aep-icon-btn{display:inline-flex;align-items:center;justify-content:center;'
			+ 'width:20px;height:20px;margin:0 4px;border-radius:50%;border:1px solid #d8dadd;'
			+ 'background:#f5f6f7;color:#6b7078;cursor:pointer;vertical-align:middle;padding:0;'
			+ 'transition:background .15s ease,color .15s ease,border-color .15s ease;}'
			+ '.aep-icon-btn:hover{background:#e8580c;border-color:#e8580c;color:#fff;}'
			+ '#' + TOOLTIP_ID + '{position:fixed;z-index:2147483647;width:230px;background:#fff;'
			+ 'border-radius:14px;box-shadow:0 14px 32px rgba(20,20,30,.22);padding:12px;'
			+ 'font-family:Rubik,Arial,sans-serif;direction:rtl;border:1px solid #eee;}'
			+ '#' + TOOLTIP_ID + ' .aep-img{width:100%;max-height:130px;object-fit:cover;'
			+ 'border-radius:9px;margin-bottom:8px;display:block;background:#f2f2f2;}'
			+ '#' + TOOLTIP_ID + ' .aep-title{font-size:12.5px;font-weight:600;color:#20232b;'
			+ 'line-height:1.5;margin-bottom:6px;}'
			+ '#' + TOOLTIP_ID + ' .aep-price{font-size:14px;font-weight:800;color:#e8580c;margin-bottom:8px;}'
			+ '#' + TOOLTIP_ID + ' .aep-loading{font-size:12px;color:#9aa0a6;}'
			+ '#' + TOOLTIP_ID + ' .aep-open{display:inline-block;font-size:11.5px;font-weight:700;'
			+ 'color:#fff;background:#e8580c;padding:5px 12px;border-radius:14px;text-decoration:none;}'
			+ '#' + TOOLTIP_ID + ' .aep-open:hover{background:#c94b09;}';
		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
	}

	function hideTooltip() {
		if (currentTooltip) {
			currentTooltip.remove();
			currentTooltip = null;
			currentHref = null;
			currentIcon = null;
		}
	}

	// ממקם תמיד לפי המיקום *הנוכחי* של הסמל בדף (getBoundingClientRect נמדד
	// מחדש בכל קריאה) - ולא לפי נקודת לחיצה קפואה. ככה, כשקוראים לפונקציה הזו
	// שוב אחרי גלילה (ראו listener של scroll למטה), החלונית "עוקבת" אחרי
	// הסמל/קישור בדיוק כמו שהוא זז על המסך. גם מודד את הגודל *האמיתי* שהחלונית
	// תפסה אחרי שהיא כבר בדף (לא הערכה קבועה מראש) כדי למנוע חיתוך בקצה המסך.
	function positionTooltip(el, icon) {
		var margin = 10;
		var iconRect = icon.getBoundingClientRect();
		var rect = el.getBoundingClientRect();
		var width = rect.width || 230;
		var height = rect.height || 160;
		var x = iconRect.left;
		var y = iconRect.bottom;

		// עברית/RTL - עדיף שהחלונית תיפתח משמאל לנקודת העיגון (כלומר "לתוך"
		// הדף), לא מימינה (שם היא לרוב תיחתך מחוץ למסך).
		var left = x - width;
		if (left < margin) left = x + margin;
		if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
		if (left < margin) left = margin;

		var top = y + margin;
		if (top + height > window.innerHeight - margin) top = y - height - margin;
		if (top < margin) top = margin;

		el.style.left = left + 'px';
		el.style.top = top + 'px';
	}

	var CURRENCY_SYMBOLS = { USD: '$', ILS: '₪', NIS: '₪', EUR: '€', GBP: '£' };

	function formatPrice(price, currency) {
		if (!price) return '';
		var symbol = currency ? (CURRENCY_SYMBOLS[currency.toUpperCase()] || (currency.toUpperCase() + ' ')) : '';
		return symbol + price;
	}

	function renderTooltipBody(el, href, preview, icon) {
		if (!preview || (!preview.title && !preview.image)) {
			hideTooltip();
			return;
		}
		var priceText = formatPrice(preview.price, preview.currency);
		el.innerHTML = ''
			+ (preview.image ? '<img class="aep-img" src="' + escapeHtml(preview.image) + '" alt="">' : '')
			+ (preview.title ? '<div class="aep-title">' + escapeHtml(preview.title) + '</div>' : '')
			+ (priceText ? '<div class="aep-price">' + escapeHtml(priceText) + '</div>' : '')
			+ '<a class="aep-open" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">פתח באתר ↗</a>';

		// הגובה עשוי להשתנות (במיוחד אחרי טעינת התמונה) - ממקמים מחדש לפי
		// הגודל האמיתי, ושוב ברגע שהתמונה עצמה סיימה להיטען.
		positionTooltip(el, icon);
		var img = el.querySelector('.aep-img');
		if (img) {
			img.addEventListener('load', function () {
				if (currentTooltip === el) positionTooltip(el, icon);
			});
		}
	}

	function showPreview(href, icon) {
		injectStyles();

		if (currentTooltip && currentHref === href) {
			hideTooltip(); // לחיצה שנייה על אותו סמל - סוגר את החלונית.
			return;
		}
		hideTooltip();

		var socket = getSocket();
		if (!socket) return;

		var tooltip = document.createElement('div');
		tooltip.id = TOOLTIP_ID;
		tooltip.innerHTML = '<div class="aep-loading">טוען תקציר מוצר...</div>';
		document.body.appendChild(tooltip);
		currentTooltip = tooltip;
		currentHref = href;
		currentIcon = icon;
		positionTooltip(tooltip, icon);

		if (previewCache[href]) {
			renderTooltipBody(tooltip, href, previewCache[href], icon);
			return;
		}

		socket.emit('plugins.aliexpressPreview.getPreview', { url: href }, function (err, preview) {
			if (currentTooltip !== tooltip) return; // המשתמש כבר סגר/פתח משהו אחר בינתיים.
			if (err || !preview) {
				hideTooltip();
				return;
			}
			if (preview.title || preview.image) previewCache[href] = preview;
			renderTooltipBody(tooltip, href, preview, icon);
		});
	}

	function bindLink(anchor) {
		if (anchor.getAttribute('data-aep-bound')) return;
		anchor.setAttribute('data-aep-bound', '1');

		var href = anchor.href;
		var icon = document.createElement('button');
		icon.type = 'button';
		icon.className = 'aep-icon-btn';
		icon.innerHTML = ICON_SVG;
		icon.title = 'תקציר מוצר';
		icon.setAttribute('aria-label', 'הצג תקציר מוצר');

		// הכנסה *לפני* הקישור ב-DOM - בעמוד ימני-לשמאלי (RTL) זה גורם לסמל
		// להופיע בצד הימני של הקישור (הראשון ב-DOM = הכי ימני ב-RTL).
		anchor.parentNode.insertBefore(icon, anchor);

		icon.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			showPreview(href, icon);
		});
	}

	function scanLinks() {
		var anchors = document.querySelectorAll(
			'[component="post/content"] a[href], [component="topic/content"] a[href]'
		);
		anchors.forEach(function (a) {
			if (isAliexpressLink(a.href)) bindLink(a);
		});
	}

	document.addEventListener('click', function (e) {
		if (currentTooltip && !currentTooltip.contains(e.target)) hideTooltip();
	});

	// גורם לחלונית "לעקוב" אחרי הסמל שהיא שייכת לו כשגוללים את העמוד (כל
	// גלילה - גם בתוך אזור פנימי הניתן לגלילה, בזכות capture:true בשלב
	// הלכידה, ששם אירועי scroll נתפסים גם כשהם לא "מבעבעים"). מוגבל ל-
	// requestAnimationFrame כדי לא להריץ מדידות פריסה בכל פריים של הגלילה.
	var repositionScheduled = false;
	function scheduleReposition() {
		if (repositionScheduled || !currentTooltip || !currentIcon) return;
		repositionScheduled = true;
		requestAnimationFrame(function () {
			repositionScheduled = false;
			if (currentTooltip && currentIcon) positionTooltip(currentTooltip, currentIcon);
		});
	}
	window.addEventListener('scroll', scheduleReposition, { passive: true, capture: true });
	window.addEventListener('resize', scheduleReposition, { passive: true });

	function onPageChange() {
		scanLinks();
	}

	if (window.$) {
		$(window).on('action:ajaxify.end action:posts.loaded action:topic.loaded', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
