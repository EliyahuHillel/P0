/*
 * להדבקה ב: Admin Control Panel -> Appearance -> Custom -> Custom JavaScript
 * (מדביקים מתחת לקוד הקיים - זה בסדר גמור שיש כמה סקריפטים ב-Custom JS).
 *
 * דורש שהפלאגין nodebb-plugin-aliexpress-preview מותקן ופעיל בשרת - הוא
 * זה ששולף ומטמין בפועל את תקציר המוצר (ראו README.md בתיקיית הפלאגין).
 *
 * מה זה עושה:
 * כל קישור בתוך פוסט שמצביע ל-aliexpress.com (בכל תת-דומיין, למשל
 * he.aliexpress.com) מקבל אוטומטית "וו" (hook) - במחשב: ריחוף של כשליש
 * שנייה מעל הקישור פותח חלונית קטנה עם שם המוצר ותמונה שלו (נשלף פעם
 * אחת מהשרת ונשמר בזיכרון הדף כדי לא לשלוח בקשה כפולה לאותו קישור).
 * בנייד (שאין בו "ריחוף" אמיתי): הקשה ראשונה על קישור כזה פותחת את
 * החלונית במקום לנווט מיד, הקשה שנייה (או על "פתח באתר") ממשיכה לקישור.
 */
(function () {
	'use strict';

	var TOOLTIP_ID = 'aep-tooltip';
	var STYLE_ID = 'aep-preview-style';
	var HOVER_DELAY_MS = 350;
	var IS_TOUCH = (function () {
		try {
			return window.matchMedia && window.matchMedia('(hover: none)').matches;
		} catch (e) {
			return false;
		}
	})();

	var previewCache = {};
	var hoverTimer = null;
	var currentTooltip = null;

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
			+ '#' + TOOLTIP_ID + '{position:fixed;z-index:9999;max-width:250px;background:#fff;'
			+ 'border-radius:14px;box-shadow:0 14px 32px rgba(20,20,30,.22);padding:12px;'
			+ 'font-family:Rubik,Arial,sans-serif;direction:rtl;border:1px solid #eee;}'
			+ '#' + TOOLTIP_ID + ' .aep-img{width:100%;max-height:130px;object-fit:cover;'
			+ 'border-radius:9px;margin-bottom:8px;display:block;background:#f2f2f2;}'
			+ '#' + TOOLTIP_ID + ' .aep-title{font-size:12.5px;font-weight:600;color:#20232b;'
			+ 'line-height:1.5;margin-bottom:6px;}'
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
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
		if (currentTooltip) {
			currentTooltip.remove();
			currentTooltip = null;
		}
	}

	function positionTooltip(el, x, y) {
		var margin = 12;
		var rect = { width: 250, height: 200 }; // הערכה שמרנית, מספיקה כדי לא לחתוך את הקצה.
		var left = Math.min(x + margin, window.innerWidth - rect.width - margin);
		var top = Math.min(y + margin, window.innerHeight - rect.height - margin);
		left = Math.max(margin, left);
		top = Math.max(margin, top);
		el.style.left = left + 'px';
		el.style.top = top + 'px';
	}

	function renderTooltipBody(el, href, preview) {
		if (!preview || (!preview.title && !preview.image)) {
			hideTooltip();
			return;
		}
		el.innerHTML = ''
			+ (preview.image ? '<img class="aep-img" src="' + escapeHtml(preview.image) + '" alt="">' : '')
			+ (preview.title ? '<div class="aep-title">' + escapeHtml(preview.title) + '</div>' : '')
			+ '<a class="aep-open" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">פתח באתר ↗</a>';
	}

	function showPreview(href, x, y) {
		injectStyles();
		hideTooltip();

		var socket = getSocket();
		if (!socket) return;

		var tooltip = document.createElement('div');
		tooltip.id = TOOLTIP_ID;
		tooltip.innerHTML = '<div class="aep-loading">טוען תקציר מוצר...</div>';
		document.body.appendChild(tooltip);
		currentTooltip = tooltip;
		positionTooltip(tooltip, x, y);

		if (previewCache[href]) {
			renderTooltipBody(tooltip, href, previewCache[href]);
			return;
		}

		socket.emit('plugins.aliexpressPreview.getPreview', { url: href }, function (err, preview) {
			// אם המשתמש כבר הזיז את העכבר משם עד שהתשובה הגיעה - אל תציג כלום.
			if (currentTooltip !== tooltip) return;
			if (err || !preview) {
				hideTooltip();
				return;
			}
			if (preview.title || preview.image) previewCache[href] = preview;
			renderTooltipBody(tooltip, href, preview);
		});
	}

	function bindLink(anchor) {
		if (anchor.getAttribute('data-aep-bound')) return;
		anchor.setAttribute('data-aep-bound', '1');

		var href = anchor.href;

		if (IS_TOUCH) {
			anchor.addEventListener('click', function (e) {
				if (anchor.getAttribute('data-aep-shown') === '1') return; // הקשה שנייה - ניווט רגיל
				e.preventDefault();
				anchor.setAttribute('data-aep-shown', '1');
				showPreview(href, e.clientX || 0, e.clientY || 0);
			});
			return;
		}

		anchor.addEventListener('mouseenter', function (e) {
			var clientX = e.clientX;
			var clientY = e.clientY;
			hoverTimer = setTimeout(function () {
				showPreview(href, clientX, clientY);
			}, HOVER_DELAY_MS);
		});
		anchor.addEventListener('mouseleave', function () {
			hideTooltip();
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

	function onPageChange() {
		scanLinks();
	}

	if (window.$) {
		$(window).on('action:ajaxify.end action:posts.loaded action:topic.loaded', onPageChange);
	}
	document.addEventListener('DOMContentLoaded', onPageChange);
	onPageChange();
})();
