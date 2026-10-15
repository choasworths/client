(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var CDN = 'https://cdn.chaosworths.com';

    function byId(id) { return document.getElementById(id); }

    function onMediaChange(query, fn) {
        if (query.addEventListener) query.addEventListener('change', fn);
        else if (query.addListener) query.addListener(fn);
    }

    function initMobileMenu() {
        var toggle = byId('menu-toggle');
        var menu = byId('mobile-menu');
        if (!toggle || !menu) return;

        function setOpen(open) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            menu.classList.toggle('open', open);
            menu.hidden = !open;
        }

        toggle.addEventListener('click', function () {
            setOpen(toggle.getAttribute('aria-expanded') !== 'true');
        });
        menu.addEventListener('click', function (e) {
            if (e.target.closest('a')) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menu.classList.contains('open')) {
                setOpen(false);
                toggle.focus();
            }
        });
        onMediaChange(window.matchMedia('(min-width: 1024px)'), function (e) {
            if (e.matches) setOpen(false);
        });
    }

    function initReveal() {
        var items = document.querySelectorAll('[data-reveal]');
        if (!items.length || reduceMotion.matches || !('IntersectionObserver' in window)) return;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            });
        }, { threshold: 0.08 });
        items.forEach(function (el) {
            if (el.getBoundingClientRect().top > window.innerHeight) {
                el.classList.add('will-reveal');
                io.observe(el);
            }
        });
    }

    var activeDialog = null;

    function focusables(root) {
        return Array.prototype.filter.call(
            root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'),
            function (el) { return el.offsetParent !== null || el === document.activeElement; }
        );
    }

    function showDialog(overlay, opener) {
        if (!overlay) return;
        if (activeDialog) hideDialog(true);
        overlay.hidden = false;
        overlay.classList.remove('is-closing');
        activeDialog = { el: overlay, opener: opener || document.activeElement };
        document.documentElement.style.overflow = 'hidden';
        document.dispatchEvent(new CustomEvent('lc:dialog', { detail: { open: true } }));
        var target = overlay.querySelector('[data-autofocus]') || overlay.querySelector('input:checked') || focusables(overlay)[0];
        setTimeout(function () { if (target && activeDialog && activeDialog.el === overlay) target.focus({ preventScroll: true }); }, 40);
    }

    function hideDialog(immediate) {
        if (!activeDialog) return;
        var current = activeDialog;
        activeDialog = null;
        var el = current.el;
        if (immediate || reduceMotion.matches) {
            el.hidden = true;
        } else {
            el.classList.add('is-closing');
            setTimeout(function () {
                if (activeDialog && activeDialog.el === el) return;
                el.hidden = true;
                el.classList.remove('is-closing');
            }, 200);
        }
        document.documentElement.style.overflow = '';
        document.dispatchEvent(new CustomEvent('lc:dialog', { detail: { open: false } }));
        if (!immediate && current.opener && typeof current.opener.focus === 'function') current.opener.focus();
    }

    function initDialogs() {
        document.querySelectorAll('.dialog-overlay').forEach(function (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay || e.target.closest('[data-dialog-close]')) hideDialog();
            });
        });
        document.addEventListener('keydown', function (e) {
            if (!activeDialog) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                hideDialog();
                return;
            }
            if (e.key !== 'Tab') return;
            var list = focusables(activeDialog.el);
            if (!list.length) return;
            var first = list[0];
            var last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    function normaliseUrl(u) {
        if (typeof u !== 'string') return null;
        var m = /^https:\/\/[^/]+(\/.+)$/.exec(u);
        return m ? CDN + m[1] : null;
    }

    function pick(manifest, target) {
        if (!manifest || !Array.isArray(manifest.builds)) return null;
        for (var i = 0; i < manifest.builds.length; i++) {
            var b = manifest.builds[i];
            if (!b || b.target !== target) continue;
            var url = normaliseUrl(b.url);
            if (!url) continue;
            return { target: b.target, file: b.file, url: url };
        }
        return null;
    }

    var manifestPromise = null;
    function loadManifests() {
        if (manifestPromise) return manifestPromise;
        function load(path) {
            return fetch(CDN + path, { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; });
        }
        manifestPromise = Promise.all([load('/installer/manifest.json'), load('/launcher/manifest.json')])
            .then(function (r) { return { installer: r[0], launcher: r[1] }; });
        return manifestPromise;
    }

    function resolveDownloadPage() {
        if (!byId('download-btn')) return;

        var detected = detectPlatform();
        if (detected) {
            document.querySelectorAll('.platform-card[data-platform]').forEach(function (card) {
                var targets = (card.getAttribute('data-platform') || '').split(' ');
                if (targets.indexOf(detected) === -1) return;
                card.classList.add('is-detected');
                var badge = document.createElement('span');
                badge.className = 'detected-badge';
                badge.textContent = 'Your system';
                card.appendChild(badge);
            });
        }

        var verEl = byId('version-text');
        if (verEl) {
            var pinned = ((byId('download-btn').getAttribute('href') || '').match(/AxquenClientSetup-([0-9]+\.[0-9]+\.[0-9]+)-/) || [])[1];
            verEl.textContent = pinned ? 'Latest: v' + pinned : 'Latest release';
        }

        function apply(id, build) {
            if (!build) return;
            var el = byId(id);
            if (!el) return;
            el.href = build.url;
            if (el.hasAttribute('download')) {
                el.setAttribute('download', build.file || build.url.split('/').pop());
            }
        }

        loadManifests().then(function (m) {
            var installer = m.installer, launcher = m.launcher;
            apply('download-btn', pick(installer, 'win-x64'));
            apply('download-btn-linux', pick(installer, 'linux-x64'));
            apply('download-btn-mac-arm', pick(launcher, 'mac-arm64'));
            apply('download-btn-mac-intel', pick(launcher, 'mac-x64'));
            apply('download-btn-linux-appimage', pick(launcher, 'linux-appimage'));

            var version = (launcher && launcher.version) || (installer && installer.version);
            if (version) {
                ['version-text', 'version-text-mac', 'version-text-linux'].forEach(function (id) {
                    var el = byId(id);
                    if (el) el.textContent = 'Latest: v' + version;
                });
            }

            var lin = pick(installer, 'linux-x64');
            var chmod = byId('linux-chmod-name');
            if (lin && chmod) {
                chmod.textContent = 'chmod +x ' + (lin.file || lin.url.split('/').pop());
            }
        });
    }

    function detectPlatform() {
        var ua = navigator.userAgent || '';
        var touch = navigator.maxTouchPoints || 0;
        if (/Android|iPhone|iPad|iPod|Windows Phone|CrOS/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return null;
        if (/Windows NT|Win32|Win64/i.test(ua)) return 'win-x64';
        if (/Macintosh|Mac OS X/i.test(ua)) return 'mac-arm64';
        if (/Linux/i.test(ua)) return 'linux-appimage';
        return null;
    }

    var PLATFORM_NAMES = { 'win-x64': 'Windows', 'mac-arm64': 'macOS', 'mac-x64': 'macOS', 'linux-appimage': 'Linux' };

    function initDownloadDialog() {
        var overlay = byId('download-dialog');
        if (!overlay) return;
        var action = byId('download-action');
        var actionLabel = byId('download-action-label');
        var loading = byId('download-loading');
        var note = byId('download-note');
        var radios = overlay.querySelectorAll('input[name="platform"]');
        var detected = detectPlatform();
        var urls = null;
        var state = 'idle';
        var DEFAULT_NOTE = note ? note.textContent : '';

        if (detected) {
            var heroLabel = byId('hero-download-label');
            if (heroLabel) heroLabel.textContent = 'Download for ' + PLATFORM_NAMES[detected];
            radios.forEach(function (r) { r.checked = r.value === detected; });
        }

        function selected() {
            for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
            return 'win-x64';
        }

        function render() {
            var url = urls && urls[selected()];
            loading.hidden = state !== 'loading';
            action.hidden = state === 'loading';
            action.href = url || '/download';
            actionLabel.textContent = url ? 'Download Axquen Client' : 'Open the download page';
            if (url) action.setAttribute('download', '');
            else action.removeAttribute('download');
            if (state === 'error' && note) note.textContent = 'Could not reach the release server. The download page has every build.';
        }

        function fetchUrls() {
            if (urls || state === 'loading') return;
            state = 'loading';
            render();
            var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 10000); });
            Promise.race([loadManifests(), timeout]).then(function (m) {
                var map = {};
                if (m) {
                    var win = pick(m.installer, 'win-x64');
                    if (win) map['win-x64'] = win.url;
                    ['mac-arm64', 'mac-x64', 'linux-appimage'].forEach(function (t) {
                        var b = pick(m.launcher, t);
                        if (b) map[t] = b.url;
                    });
                }
                urls = map;
                state = Object.keys(map).length ? 'ready' : 'error';
                render();
            });
        }

        radios.forEach(function (r) {
            r.addEventListener('change', function () {
                if (note && state !== 'error') note.textContent = DEFAULT_NOTE;
                render();
            });
        });

        action.addEventListener('click', function () {
            if (!note) return;
            note.textContent = urls && urls[selected()]
                ? 'Your download is starting. Run the file once it finishes.'
                : 'Taking you to the download page.';
        });

        document.querySelectorAll('[data-download-open]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                if (note && state !== 'error') note.textContent = DEFAULT_NOTE;
                showDialog(overlay, btn);
                fetchUrls();
            });
        });
    }

    function initImageDialog() {
        var overlay = byId('image-dialog');
        if (!overlay) return;
        var img = byId('image-dialog-img');
        var title = byId('image-dialog-title');
        var desc = byId('image-dialog-desc');
        document.addEventListener('click', function (e) {
            var trigger = e.target.closest('[data-lightbox]');
            if (!trigger) return;
            e.preventDefault();
            img.src = trigger.getAttribute('data-lightbox');
            img.alt = trigger.getAttribute('data-alt') || '';
            title.textContent = trigger.getAttribute('data-title') || '';
            desc.textContent = trigger.getAttribute('data-text') || '';
            showDialog(overlay, trigger);
        });
    }

    function initTour() {
        var root = byId('client-tour');
        if (!root) return;
        var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
        if (!tabs.length) return;
        var panels = tabs.map(function (t) { return byId(t.getAttribute('aria-controls')); });
        var strip = root.querySelector('.tabs-overflow');
        var bar = root.querySelector('.tour-timer > span');
        var toggle = root.querySelector('.tour-play-toggle');
        var toggleLabel = toggle ? toggle.querySelector('span') : null;
        var DELAY = 5500;
        var index = 0;
        var userPaused = false;
        var inView = false;
        var focusInside = false;
        var dialogOpen = false;
        var timer = null;

        function running() {
            return !reduceMotion.matches && !userPaused && inView && !document.hidden && !focusInside && !dialogOpen;
        }

        function restart() {
            clearTimeout(timer);
            if (!bar) return;
            bar.classList.remove('timer-running');
            void bar.offsetWidth;
            if (running()) {
                bar.classList.add('timer-running');
                timer = setTimeout(function () { select((index + 1) % tabs.length, false); }, DELAY);
            }
        }

        function centerTab(tab) {
            if (!strip || strip.scrollWidth <= strip.clientWidth) return;
            var s = strip.getBoundingClientRect();
            var t = tab.getBoundingClientRect();
            strip.scrollTo({ left: strip.scrollLeft + t.left - s.left - (strip.clientWidth - t.width) / 2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        }

        function select(i, focus) {
            index = i;
            tabs.forEach(function (tab, n) {
                var on = n === i;
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
                var panel = panels[n];
                if (!panel) return;
                panel.hidden = !on;
                panel.classList.remove('is-entering');
                if (on && !reduceMotion.matches) {
                    void panel.offsetWidth;
                    panel.classList.add('is-entering');
                }
            });
            if (focus) tabs[i].focus();
            centerTab(tabs[i]);
            restart();
        }

        tabs.forEach(function (tab, n) {
            tab.addEventListener('click', function () { select(n, false); });
            tab.addEventListener('keydown', function (e) {
                var next = null;
                if (e.key === 'ArrowRight') next = (n + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') next = (n - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = tabs.length - 1;
                if (next === null) return;
                e.preventDefault();
                select(next, true);
            });
        });

        function syncToggle() {
            if (!toggle) return;
            if (reduceMotion.matches) {
                toggle.disabled = true;
                toggle.classList.add('is-paused');
                toggle.setAttribute('aria-label', 'Automatic preview is off');
                if (toggleLabel) toggleLabel.textContent = 'Manual preview';
                return;
            }
            toggle.disabled = false;
            toggle.classList.toggle('is-paused', userPaused);
            toggle.setAttribute('aria-label', userPaused ? 'Resume automatic previews' : 'Pause automatic previews');
            if (toggleLabel) toggleLabel.textContent = userPaused ? 'Resume preview' : 'Auto preview';
        }

        if (toggle) {
            toggle.addEventListener('click', function () {
                userPaused = !userPaused;
                syncToggle();
                restart();
            });
        }

        root.addEventListener('focusin', function (e) {
            if (toggle && toggle.contains(e.target)) return;
            focusInside = true;
            restart();
        });
        root.addEventListener('focusout', function (e) {
            if (e.relatedTarget && root.contains(e.relatedTarget)) return;
            focusInside = false;
            restart();
        });
        document.addEventListener('visibilitychange', restart);
        document.addEventListener('lc:dialog', function (e) {
            dialogOpen = !!(e.detail && e.detail.open);
            restart();
        });
        onMediaChange(reduceMotion, function () { syncToggle(); restart(); });

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                inView = entries[0].isIntersecting;
                restart();
            }, { threshold: 0.2 }).observe(root);
        }

        syncToggle();
        tabs.forEach(function (tab, n) { tab.tabIndex = n === 0 ? 0 : -1; });
    }

    var STEVE_SKIN = '/assets/steve.png';
    var UUID_RE = /^[0-9a-f]{32}$/;
    var staffPromise = null;

    function fetchStaff() {
        if (staffPromise) return staffPromise;
        staffPromise = fetch('https://api.chaosworths.com/cosmetics/staff', { credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) { return Array.isArray(list) ? list : []; })
            .catch(function () { return []; });
        return staffPromise;
    }

    function findStaff(list, key) {
        if (typeof key !== 'string' || !key) return null;
        var found = null;
        for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            if (!entry || entry.key !== key) continue;
            if (found) return null;
            found = entry;
        }
        return found;
    }

    function axquenSkinUrl(entry) {
        var url = entry.skin ? entry.skin.url : null;
        return typeof url === 'string' && url.indexOf('https://') === 0 ? url : null;
    }

    function skinUrlFor(entry) {
        if (!entry) return STEVE_SKIN;
        if (UUID_RE.test(entry.uuid)) return 'https://minotar.net/skin/' + entry.uuid;
        return axquenSkinUrl(entry) || STEVE_SKIN;
    }

    function modelFor(entry) {
        if (!entry) return Promise.resolve(null);
        if (UUID_RE.test(entry.uuid)) return AxquenCosmeticRenderer.loadModelByUuid(entry.uuid);
        if (axquenSkinUrl(entry)) return Promise.resolve(entry.skin.model === 'slim');
        return Promise.resolve(null);
    }

    function loadSkinImage(url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = reject;
            img.src = url;
        });
    }

    function drawHead(img, entry) {
        if (!img) return;
        var url = skinUrlFor(entry);
        img.setAttribute('data-head', url);
        loadSkinImage(url)
            .catch(function () { return loadSkinImage(STEVE_SKIN); })
            .then(function (skin) {
                if (img.getAttribute('data-head') !== url) return;
                var s = skin.naturalWidth / 64;
                var canvas = document.createElement('canvas');
                canvas.width = canvas.height = 8 * s;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(skin, 8 * s, 8 * s, 8 * s, 8 * s, 0, 0, 8 * s, 8 * s);
                ctx.drawImage(skin, 40 * s, 8 * s, 8 * s, 8 * s, 0, 0, 8 * s, 8 * s);
                img.src = canvas.toDataURL();
            })
            .catch(function () {});
    }

    function accountName(session) {
        if (!session) return null;
        return session.name || session.minecraft_username || session.username || null;
    }

    window.lcSkinUrl = skinUrlFor;
    window.lcSkinModel = modelFor;
    window.lcDrawHead = drawHead;
    window.lcAccountName = accountName;

    function initVoiceCard() {
        var signal = byId('voice-signal');
        if (!signal) return;
        var parts = ['left', 'right'].map(function (side) {
            return {
                side: side,
                head: signal.querySelector('.voice-head[data-side="' + side + '"]'),
                wave: signal.querySelector('.voice-wave[data-side="' + side + '"]')
            };
        });
        var speaker = 'left';
        var timer = null;
        var inView = false;

        function setSpeaker(side) {
            parts.forEach(function (p) {
                var on = p.side === side;
                [p.head, p.wave].forEach(function (el) {
                    if (!el) return;
                    el.classList.toggle('is-speaking', on);
                    el.classList.toggle('is-listening', !on);
                });
            });
        }

        function between(a, b) { return a + Math.random() * (b - a); }

        function turn() {
            setSpeaker(speaker);
            timer = setTimeout(function () {
                speaker = speaker === 'left' ? 'right' : 'left';
                if (Math.random() < 0.3) {
                    setSpeaker(null);
                    timer = setTimeout(turn, between(300, 550));
                } else {
                    turn();
                }
            }, between(2000, 3000));
        }

        function sync() {
            clearTimeout(timer);
            timer = null;
            if (reduceMotion.matches) {
                setSpeaker('left');
                return;
            }
            if (inView && !document.hidden) turn();
        }

        setSpeaker('left');
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                inView = entries[0].isIntersecting;
                sync();
            }).observe(signal);
        } else {
            inView = true;
            sync();
        }
        document.addEventListener('visibilitychange', sync);
        onMediaChange(reduceMotion, sync);
    }

    function initCompare() {
        var view = byId('compare-view');
        if (!view) return;
        var range = view.querySelector('.compare-range');

        function setSplit(percent) {
            view.style.setProperty('--split', percent + '%');
        }

        var label = view.querySelector('.compare-label-other');
        var others = view.querySelectorAll('.compare-other');
        var switches = document.querySelectorAll('.compare-switch [data-compare]');
        switches.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var client = btn.getAttribute('data-compare');
                var name = btn.getAttribute('data-name');
                switches.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
                others.forEach(function (img) { img.classList.toggle('is-active', img.getAttribute('data-client') === client); });
                label.textContent = name;
                range.setAttribute('aria-label', 'Screenshot divider, Axquen Client on the left, ' + name + ' on the right');
            });
        });

        range.addEventListener('input', function () { setSplit(range.value); });
        view.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse') return;
            var rect = view.getBoundingClientRect();
            var percent = Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100));
            range.value = percent;
            setSplit(percent);
        });
    }

    function initFaq() {
        var items = document.querySelectorAll('.faq-item');
        if (!items.length) return;
        items.forEach(function (item) {
            item.addEventListener('toggle', function () {
                if (!item.open) return;
                items.forEach(function (other) { if (other !== item) other.open = false; });
            });
        });
    }

    function sanitizeUrl(url) {
        if (!url) return '';
        try {
            var u = new URL(url);
            return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
        } catch (e) { return ''; }
    }

    function sanitizeColor(c) {
        if (!c) return '';
        return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '';
    }

    var ARROW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

    function initNews() {
        var list = byId('news-list');
        if (!list) return;
        var section = byId('news');

        function hide() { if (section) section.hidden = true; }

        fetch('https://api.chaosworths.com/news')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                var items = data && Array.isArray(data.items) ? data.items.filter(function (i) { return i && i.title; }) : [];
                if (!items.length) { hide(); return; }
                list.textContent = '';
                items.forEach(function (item) {
                    var link = sanitizeUrl(item.linkUrl);
                    var row = document.createElement(link ? 'a' : 'article');
                    row.className = 'news-item';
                    if (link) {
                        row.href = link;
                        row.target = '_blank';
                        row.rel = 'noopener';
                    }

                    var imgUrl = sanitizeUrl(item.imageUrl);
                    if (imgUrl) {
                        var img = document.createElement('img');
                        img.className = 'news-thumb';
                        img.src = imgUrl;
                        img.alt = '';
                        img.loading = 'lazy';
                        img.addEventListener('error', function () { img.remove(); });
                        row.appendChild(img);
                    }

                    var tag = document.createElement('span');
                    tag.className = 'news-tag';
                    var dot = document.createElement('i');
                    var color = sanitizeColor(item.tagColorStart);
                    if (color) dot.style.setProperty('--news-dot', color);
                    tag.appendChild(dot);
                    tag.appendChild(document.createTextNode(item.tagText || 'Update'));
                    row.appendChild(tag);

                    var body = document.createElement('div');
                    var title = document.createElement('h3');
                    title.textContent = item.title;
                    body.appendChild(title);
                    if (item.subtitle) {
                        var sub = document.createElement('p');
                        sub.textContent = item.subtitle;
                        body.appendChild(sub);
                    }
                    row.appendChild(body);

                    if (link) row.insertAdjacentHTML('beforeend', ARROW_SVG);
                    list.appendChild(row);
                });
            })
            .catch(hide);
    }

    function initStaffTicker() {
        var track = byId('staff-ticker-track');
        if (!track) return;

        var staff = [
            { key: '140e8ed06001414691e86bdba05cd885', name: 'Chaos Worths', role: 'Owner' },
            { key: 'a8e90da7081949bf8ec3fe04386d6d0c', name: 'Z', role: 'Developer' },
            { key: '7773b7fa19e04d769a3eaba9015e77cb', name: 'Sheanan', role: 'Staff Manager' },
            { key: '', name: 'IIAhmadGamer', role: 'Social Media' },
            { key: '', name: 'ElBurrito2', role: 'macOS Tester' },
            { key: '', name: 'Hawks_12306', role: 'Tester' },
            { key: '', name: 'ItzEzio_', role: 'Tester' },
            { key: '', name: 'vvergcre', role: 'Tester' },
            { key: '55fbea717d814db8861a6709a0465633', name: 'BatGames1', role: 'Tester' },
            { key: 'b699706f466d46d9b5ca2efc13743f83', name: 'Fabski_XD', role: 'Tester' },
            { key: 'bf90548c180a43b8940d0790e9d75e26', name: 'itsmerishi4228', role: 'Tester' },
            { key: '', name: 'unterhaltsammer', role: 'Tester' },
            { key: '25de0e41adb54f3497072cb7dc62f41b', name: 'loret010', role: 'Tester' },
            { key: '', name: 'mriwe', role: 'Tester' }
        ];

        var poses = [
            { rotationY: 195, rotationX: -8, leftArmPitch: -45, rightArmPitch: 10, leftLegPitch: 20, rightLegPitch: -20, headYaw: 10 },
            { rotationY: 168, rotationX: -6, leftArmPitch: 15, rightArmPitch: -60, leftLegPitch: -15, rightLegPitch: 15, headYaw: -15 },
            { rotationY: 188, rotationX: -10, leftArmPitch: -30, rightArmPitch: -30, leftLegPitch: 0, rightLegPitch: 0, headYaw: 5 },
            { rotationY: 162, rotationX: -5, leftArmPitch: 25, rightArmPitch: 10, leftLegPitch: 30, rightLegPitch: -30, headYaw: -8 },
            { rotationY: 200, rotationX: -8, leftArmPitch: -70, rightArmPitch: 15, leftLegPitch: -10, rightLegPitch: 10, headYaw: 12 },
            { rotationY: 172, rotationX: -10, leftArmPitch: 10, rightArmPitch: -45, leftLegPitch: 25, rightLegPitch: -25, headYaw: -5 },
            { rotationY: 185, rotationX: -6, leftArmPitch: -20, rightArmPitch: -55, leftLegPitch: -20, rightLegPitch: 20, headYaw: 0 },
            { rotationY: 165, rotationX: -8, leftArmPitch: -50, rightArmPitch: 20, leftLegPitch: 15, rightLegPitch: -15, headYaw: -12 },
            { rotationY: 192, rotationX: -10, leftArmPitch: 20, rightArmPitch: -35, leftLegPitch: -25, rightLegPitch: 25, headYaw: 8 },
            { rotationY: 175, rotationX: -5, leftArmPitch: -40, rightArmPitch: -10, leftLegPitch: 10, rightLegPitch: -10, headYaw: -10 },
            { rotationY: 198, rotationX: -8, leftArmPitch: 5, rightArmPitch: -65, leftLegPitch: -30, rightLegPitch: 30, headYaw: 15 },
            { rotationY: 170, rotationX: -6, leftArmPitch: -55, rightArmPitch: 5, leftLegPitch: 20, rightLegPitch: -20, headYaw: -5 },
            { rotationY: 190, rotationX: -10, leftArmPitch: -15, rightArmPitch: -40, leftLegPitch: 0, rightLegPitch: 0, headYaw: 8 },
            { rotationY: 160, rotationX: -5, leftArmPitch: 30, rightArmPitch: -20, leftLegPitch: -20, rightLegPitch: 20, headYaw: -15 }
        ];

        function buildItem(member, copy) {
            var item = document.createElement('div');
            item.className = 'staff-ticker-item';
            if (copy) item.setAttribute('aria-hidden', 'true');
            var canvas = document.createElement('canvas');
            canvas.width = 120;
            canvas.height = 160;
            canvas.setAttribute('aria-hidden', 'true');
            item.appendChild(canvas);
            var nameEl = document.createElement('span');
            nameEl.textContent = member.name;
            item.appendChild(nameEl);
            var roleEl = document.createElement('small');
            roleEl.textContent = member.role;
            item.appendChild(roleEl);
            return { el: item, canvas: canvas };
        }

        function renderMember(member, idx, canvas, copy) {
            var pose = poses[idx % poses.length];
            return fetchStaff()
                .then(function (list) {
                    var entry = findStaff(list, member.key);
                    return AxquenCosmeticRenderer.loadImage(skinUrlFor(entry)).then(function (img) {
                        return Promise.all([img, modelFor(entry)]);
                    }, function () {
                        return Promise.all([AxquenCosmeticRenderer.loadImage(STEVE_SKIN), null]);
                    });
                })
                .then(function (res) {
                    var skinData = AxquenCosmeticRenderer.imageToData(res[0]);
                    var isSlim = res[1];
                    var frame = AxquenCosmeticRenderer.renderFrame(skinData, null, null, null, canvas.width, canvas.height, {
                        rotationY: pose.rotationY,
                        rotationX: pose.rotationX,
                        zoom: 1.1,
                        leftArmPitch: pose.leftArmPitch,
                        rightArmPitch: pose.rightArmPitch,
                        leftLegPitch: pose.leftLegPitch,
                        rightLegPitch: pose.rightLegPitch,
                        headYaw: pose.headYaw,
                        slim: typeof isSlim === 'boolean' ? isSlim : undefined
                    });
                    if (!frame) return;
                    canvas.getContext('2d').putImageData(frame, 0, 0);
                    copy.getContext('2d').drawImage(canvas, 0, 0);
                })
                .catch(function () {});
        }

        var primaries = [];
        var copies = [];
        staff.forEach(function (member) {
            var p = buildItem(member, false);
            track.appendChild(p.el);
            primaries.push(p.canvas);
        });
        staff.forEach(function (member) {
            var c = buildItem(member, true);
            track.appendChild(c.el);
            copies.push(c.canvas);
        });

        var started = false;
        var nextIdx = 0;
        function renderNext() {
            if (nextIdx >= staff.length) return;
            var idx = nextIdx++;
            renderMember(staff[idx], idx, primaries[idx], copies[idx]).then(function () {
                requestAnimationFrame(renderNext);
            });
        }
        function loadRenderer() {
            if (typeof AxquenCosmeticRenderer !== 'undefined') return Promise.resolve();
            return new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = 'cosmeticRenderer.js?v=uuid-model-1';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        function startRendering() {
            if (started) return;
            started = true;
            loadRenderer().then(function () {
                renderNext();
                renderNext();
                renderNext();
            }).catch(function () {});
        }

        var wrap = track.parentElement || track;
        if ('IntersectionObserver' in window) {
            var obs = new IntersectionObserver(function (entries) {
                if (!entries[0].isIntersecting) return;
                obs.disconnect();
                startRendering();
            }, { rootMargin: '600px 0px' });
            obs.observe(wrap);
        } else {
            startRendering();
        }
    }

    function init() {
        initMobileMenu();
        initDialogs();
        initReveal();
        initDownloadDialog();
        initImageDialog();
        initTour();
        initVoiceCard();
        initCompare();
        initFaq();
        resolveDownloadPage();
        initNews();
        initStaffTicker();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

(function () {
    var LC_AT = 'lc_at';
    var LC_RT = 'lc_rt';
    var LC_UN = 'lc_un';
    var API = 'https://api.chaosworths.com';

    function getCsrfToken() {
        return fetch(API + '/csrf', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { return data && data.token ? data.token : null; })
            .catch(function () { return null; });
    }

    function postWithCsrf(path) {
        return getCsrfToken().then(function (tok) {
            if (!tok) return null;
            return fetch(API + path, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrf_token: tok })
            });
        });
    }

    function fetchSignedIn(path, init) {
        return fetch(API + path, init).then(function (r) {
            if (r.status !== 401) return r;
            return postWithCsrf('/auth/web/refresh')
                .then(function (rr) { return rr && rr.ok ? fetch(API + path, init) : r; });
        });
    }

    var navSession = null;
    var navSessionPromise = null;

    function fetchNavSession() {
        if (navSessionPromise) return navSessionPromise;
        navSessionPromise = fetchSignedIn('/auth/me', { credentials: 'include' })
            .then(function (r) {
                if (!r.ok) { navSession = null; return null; }
                return r.json().then(function (data) { navSession = data; return data; });
            })
            .catch(function () { navSession = null; return null; })
            .finally(function () { navSessionPromise = null; });
        return navSessionPromise;
    }

    function isLoggedIn() {
        return !!navSession;
    }

    var headSeq = 0;
    var shownAccount = null;

    function clearHeads() {
        headSeq++;
        ['nav-player-head', 'nav-dropdown-head'].forEach(function (id) {
            var img = document.getElementById(id);
            if (!img) return;
            img.removeAttribute('src');
            img.removeAttribute('data-head');
        });
    }

    function showAccount(id) {
        if (id === shownAccount) return false;
        shownAccount = id;
        document.dispatchEvent(new CustomEvent('lc:account'));
        return true;
    }

    function ownSkinEntry() {
        if (!navSession || navSession.kind !== 'axquen' || navSession.uuid) return Promise.resolve(navSession);
        return fetch(API + '/skin/me', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { return { skin: data && data.skin }; })
            .catch(function () { return null; });
    }

    function setPoints(value) {
        var lpEl = document.getElementById('nav-lp-count');
        if (lpEl) lpEl.textContent = Number(value).toLocaleString();
    }

    function updateNavAccount() {
        var loginBtn = document.getElementById('nav-login-btn');
        var playerWrap = document.getElementById('nav-player-wrap');
        var playerName = document.getElementById('nav-player-name');
        if (!loginBtn || !playerWrap) return;

        if (isLoggedIn()) {
            var un = window.lcAccountName(navSession) || 'Player';
            loginBtn.classList.add('hidden');
            playerWrap.classList.remove('hidden');
            if (playerName) playerName.textContent = un;
            var dropName = document.getElementById('nav-dropdown-name');
            if (dropName) dropName.textContent = un;
            var trigger = document.getElementById('nav-player-btn');
            if (trigger) trigger.setAttribute('aria-label', 'Account menu for ' + un);

            if (navSession && navSession.coins != null) {
                setPoints(navSession.coins);
            } else if (document.getElementById('nav-lp-count')) {
                fetch(API + '/user/me', { credentials: 'include' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (d) { if (d && d.coins != null) setPoints(d.coins); })
                    .catch(function () {});
            }

            if (showAccount(navSession.id)) clearHeads();
            var seq = ++headSeq;
            ownSkinEntry().then(function (entry) {
                if (seq !== headSeq) return;
                window.lcDrawHead(document.getElementById('nav-player-head'), entry);
                window.lcDrawHead(document.getElementById('nav-dropdown-head'), entry);
            });
        } else {
            showAccount(null);
            clearHeads();
            closeMenu(false);
            loginBtn.classList.remove('hidden');
            playerWrap.classList.add('hidden');
        }
    }

    function menuParts() {
        return {
            wrap: document.getElementById('nav-player-wrap'),
            trigger: document.getElementById('nav-player-btn'),
            dropdown: document.getElementById('nav-dropdown')
        };
    }

    function isMenuOpen() {
        var p = menuParts();
        return !!(p.dropdown && p.dropdown.classList.contains('open'));
    }

    function openMenu(focusFirst) {
        var p = menuParts();
        if (!p.trigger || !p.dropdown) return;
        p.dropdown.classList.add('open');
        p.trigger.setAttribute('aria-expanded', 'true');
        if (focusFirst) {
            var first = p.dropdown.querySelector('button, a[href]');
            if (first) first.focus();
        }
    }

    function closeMenu(returnFocus) {
        var p = menuParts();
        if (!p.trigger || !p.dropdown || !p.dropdown.classList.contains('open')) return;
        p.dropdown.classList.remove('open');
        p.trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) p.trigger.focus();
    }

    function initNavAccount() {
        var loginBtn = document.getElementById('nav-login-btn');
        var logoutItem = document.getElementById('nav-logout-item');
        var p = menuParts();

        if (!loginBtn) return;

        loginBtn.addEventListener('click', function () {
            if (window.openAuthModal) {
                window.openAuthModal();
            } else {
                window.location.href = '/store?auth=1';
            }
        });

        if (p.trigger && p.dropdown) {
            p.trigger.addEventListener('click', function () {
                if (isMenuOpen()) closeMenu(false);
                else openMenu(false);
            });
            p.trigger.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    openMenu(true);
                }
            });
            document.addEventListener('click', function (e) {
                if (isMenuOpen() && p.wrap && !p.wrap.contains(e.target)) closeMenu(false);
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && isMenuOpen()) {
                    e.stopPropagation();
                    closeMenu(true);
                }
            });
            if (p.wrap) {
                p.wrap.addEventListener('focusout', function (e) {
                    if (e.relatedTarget && !p.wrap.contains(e.relatedTarget)) closeMenu(false);
                });
            }
        }

        if (logoutItem) {
            logoutItem.addEventListener('click', function () {
                postWithCsrf('/auth/web/logout').catch(function () {});
                try {
                    localStorage.removeItem(LC_AT);
                    localStorage.removeItem(LC_RT);
                    localStorage.removeItem(LC_UN);
                } catch (e) {}
                navSession = null;
                closeMenu(false);
                updateNavAccount();
                if (loginBtn) loginBtn.focus();
                if (window.lcStoreHandleLogout) window.lcStoreHandleLogout();
            });
        }

        try {
            localStorage.removeItem(LC_AT);
            localStorage.removeItem(LC_RT);
            localStorage.removeItem(LC_UN);
        } catch (e) {}

        fetchNavSession().then(updateNavAccount);
    }

    window.lcIsLoggedIn = function () { return isLoggedIn(); };
    window.lcFetchSignedIn = fetchSignedIn;
    window.lcNavUpdateAccount = function () {
        fetchNavSession().then(updateNavAccount);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavAccount);
    } else {
        initNavAccount();
    }
})();

window.addEventListener('pageshow', function () {
    var overlay = document.querySelector('.page-transition');
    if (overlay) overlay.remove();
    document.body.style.opacity = '';
});
