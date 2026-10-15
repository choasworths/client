(function () {
    'use strict';
    if (window.__leafStatusBannerLoaded) return;
    window.__leafStatusBannerLoaded = true;

    var BANNER_URL = '/status/banner.json';
    var STORAGE_KEY = 'leaf_status_banner_dismissed';

    function fetchJson(url) {
        return fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); });
    }

    function injectStyles() {
        if (document.getElementById('leaf-status-banner-css')) return;
        var css = document.createElement('style');
        css.id = 'leaf-status-banner-css';
        css.textContent = [
            '.leaf-status-banner{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:.65rem;',
            'padding:.55rem 1rem;font:500 .85rem/1.3 "Sora",-apple-system,system-ui,sans-serif;color:#fff;text-decoration:none;',
            'border-bottom:1px solid rgba(0,0,0,.25);box-shadow:0 4px 16px rgba(0,0,0,.25);',
            'transform:translateY(-100%);transition:transform .45s cubic-bezier(.16,1,.3,1);will-change:transform;}',
            '.leaf-status-banner.show{transform:translateY(0);}',
            '.leaf-status-banner-outage{background:linear-gradient(90deg,#dc2626,#ef4444);}',
            '.leaf-status-banner-warning{background:linear-gradient(90deg,#d97706,#f59e0b);}',
            '.leaf-status-banner-maintenance{background:linear-gradient(90deg,#2563eb,#3b82f6);}',
            '.leaf-status-banner-info{background:linear-gradient(90deg,#059669,#10b981);}',
            '.leaf-status-banner svg{flex-shrink:0;width:16px;height:16px;}',
            '.leaf-status-banner strong{font-weight:700;letter-spacing:.02em;}',
            '.leaf-status-banner-msg{opacity:.92;font-weight:400;}',
            '.leaf-status-banner-link{color:#fff;text-decoration:underline;text-underline-offset:2px;font-weight:600;margin-left:.35rem;}',
            '.leaf-status-banner-close{margin-left:.5rem;background:rgba(255,255,255,.18);border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:.7rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s ease;}',
            '.leaf-status-banner-close:hover{background:rgba(255,255,255,.32);}',
            '@media(max-width:640px){.leaf-status-banner{font-size:.78rem;padding:.45rem .65rem;flex-wrap:wrap;}.leaf-status-banner-msg{display:none;}}',
            'body.leaf-status-banner-active{padding-top:42px;transition:padding-top .35s ease;}',
            'body.leaf-status-banner-active .header{top:42px;transition:top .35s ease;}'
        ].join('');
        document.head.appendChild(css);
    }

    function dismissedKey(banner) {
        return STORAGE_KEY + ':' + (banner.since || '') + ':' + (banner.title || '');
    }

    function isDismissed(banner) {
        try { return localStorage.getItem(dismissedKey(banner)) === '1'; } catch (e) { return false; }
    }

    function markDismissed(banner) {
        try { localStorage.setItem(dismissedKey(banner), '1'); } catch (e) {}
    }

    function iconFor(type) {
        switch (type) {
            case 'outage':      return '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
            case 'warning':     return '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
            case 'maintenance': return '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';
            default:            return '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
        }
    }

    function render(banner) {
        var current = document.getElementById('leaf-status-banner');
        if (current) { current.remove(); document.body.classList.remove('leaf-status-banner-active'); }
        if (!banner || !banner.active) return;
        if (isDismissed(banner)) return;

        var type = banner.type || 'info';
        injectStyles();

        var el = document.createElement('div');
        el.id = 'leaf-status-banner';
        el.className = 'leaf-status-banner leaf-status-banner-' + type;
        el.setAttribute('role', type === 'outage' ? 'alert' : 'status');

        var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '2');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = iconFor(type);

        var titleEl = document.createElement('strong');
        titleEl.textContent = banner.title || 'Service notice';

        var msgEl = document.createElement('span');
        msgEl.className = 'leaf-status-banner-msg';
        msgEl.textContent = banner.message || '';

        var link = document.createElement('a');
        link.className = 'leaf-status-banner-link';
        link.href = '/status';
        link.textContent = 'View status \u2192';

        var close = document.createElement('button');
        close.className = 'leaf-status-banner-close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Dismiss banner');
        close.innerHTML = '\u2715';
        close.addEventListener('click', function () {
            markDismissed(banner);
            el.classList.remove('show');
            setTimeout(function () {
                el.remove();
                document.body.classList.remove('leaf-status-banner-active');
            }, 450);
        });

        el.appendChild(icon);
        el.appendChild(titleEl);
        if (banner.message) el.appendChild(msgEl);
        el.appendChild(link);
        el.appendChild(close);
        document.body.appendChild(el);

        requestAnimationFrame(function () {
            document.body.classList.add('leaf-status-banner-active');
            el.classList.add('show');
        });
    }

    function load() {
        fetchJson(BANNER_URL).then(render).catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }

    setInterval(load, 5 * 60 * 1000);
})();
