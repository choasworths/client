(function () {
    var API = 'https://api.leafclient.com';
    var STEVE_SKIN = '/assets/steve.png';
    var LIMIT = 50;
    var state = { metric: 'playtime', rows: [], board: null, me: null };
    var shown = [];
    var listSeq = 0;
    var meSeq = 0;

    function fmtPlaytime(min) {
        var h = Math.floor(min / 60);
        if (h < 1) return min + 'm';
        if (h < 1000) return h.toLocaleString() + 'h';
        return (h / 1000).toFixed(1).replace(/\.0$/, '') + 'k h';
    }
    function metricValue(row) { return state.metric === 'playtime' ? row.playtime : row.coins; }
    function metricLabel(row) {
        return state.metric === 'playtime' ? fmtPlaytime(row.playtime) : row.coins.toLocaleString();
    }

    var skinCache = {};
    function loadSkin(url) {
        if (skinCache[url]) return Promise.resolve(skinCache[url]);
        var R = window.LeafCosmeticRenderer;
        return R.loadImage(url)
            .then(function (img) { var d = R.imageToData(img); skinCache[url] = d; return d; })
            .catch(function () {
                return R.loadImage(STEVE_SKIN).then(function (img) {
                    var d = R.imageToData(img); skinCache[url] = d; return d;
                });
            });
    }

    function hash(s) {
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return h >>> 0;
    }

    var POSES = [
        { name: 'idle',      ry: 15,  rx: -2, rArm: 6,   lArm: -8,  rLeg: -3,  lLeg: 4,   head: -7 },
        { name: 'confident', ry: -18, rx: -2, rArm: -12, lArm: 10,  rLeg: -10, lLeg: 6,   head: 6 },
        { name: 'walk',      ry: 8,   rx: -3, rArm: 33,  lArm: -29, rLeg: -31, lLeg: 27,  head: -3 },
        { name: 'wave',      ry: -6,  rx: -2, rArm: -62, lArm: 9,   rLeg: -4,  lLeg: 5,   head: 5 },
        { name: 'guard',     ry: 24,  rx: 4,  rArm: 22,  lArm: -30, rLeg: 13,  lLeg: -13, head: -5 },
        { name: 'lean',      ry: -22, rx: -1, rArm: 14,  lArm: -6,  rLeg: 8,   lLeg: -8,  head: 8 },
    ];
    var CHAMPION = { name: 'champion', ry: 0, rx: -7, rArm: -19, lArm: -19, rLeg: -7, lLeg: 7, head: 0 };

    function poseFor(username, big, rank) {
        var h = hash((username || '').toLowerCase());
        var p = rank === 1 ? CHAMPION
            : rank === 2 ? POSES[1]
            : rank === 3 ? POSES[5]
            : POSES[h % POSES.length];
        return {
            rotationY: 180 + p.ry,
            rotationX: p.rx,
            zoom: big ? 0.98 : 0.92,
            rightArmPitch: p.rArm,
            leftArmPitch: p.lArm,
            rightLegPitch: p.rLeg,
            leftLegPitch: p.lLeg,
            headYaw: p.head
        };
    }

    function renderInto(canvas, row, big, rank) {
        var R = window.LeafCosmeticRenderer;
        if (!R) return;
        var w = canvas.width, h = canvas.height;
        Promise.all([loadSkin(window.lcSkinUrl(row)), window.lcSkinModel(row)]).then(function (res) {
            var skinData = res[0];
            var pose = poseFor(row.username, big, rank);
            if (typeof res[1] === 'boolean') pose.slim = res[1];
            var img = R.renderFrame(skinData, null, null, null, w, h, pose);
            if (!img) return;
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.putImageData(img, 0, -Math.round(h * 0.04));
        }).catch(function () {});
    }

    function markMe() {
        var board = state.board, me = state.me;
        var rank = board && me && me.at === board.at && me.metric === board.metric ? me.rank : null;
        shown.forEach(function (s) { s.el.classList.toggle('is-me', rank !== null && s.row.rank === rank); });
    }

    function loadMe() {
        var seq = ++meSeq;
        var board = state.board;
        state.me = null;
        markMe();
        if (!board || !window.lcIsLoggedIn || !window.lcIsLoggedIn()) return;
        window.lcFetchSignedIn('/leaderboard/me?metric=' + encodeURIComponent(board.metric) + '&limit=' + LIMIT + '&at=' + board.at, { credentials: 'include', cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (seq !== meSeq || !data || typeof data.rank !== 'number') return;
                state.me = { metric: data.metric, at: data.at, rank: data.rank };
                markMe();
            })
            .catch(function () {});
    }

    var PODIUM_ORDER = [1, 0, 2];
    function render() {
        var rows = state.rows.slice().sort(function (a, b) { return metricValue(b) - metricValue(a); });
        var top = rows.slice(0, 3), rest = rows.slice(3);
        var max = rows.length ? metricValue(rows[0]) : 1;
        shown = [];

        var podium = document.getElementById('lb-podium');
        podium.innerHTML = '';
        PODIUM_ORDER.forEach(function (idx) {
            var row = top[idx];
            if (!row) return;
            var rank = idx + 1;
            var card = document.createElement('div');
            card.className = 'lb-podium-card rank-' + rank;
            shown.push({ row: row, el: card });
            card.innerHTML =
                '<div class="lb-medal medal-' + rank + '">' + rank + '</div>' +
                '<div class="lb-podium-stage"><canvas class="lb-skin" width="150" height="210"></canvas></div>' +
                '<div class="lb-podium-name">' + escapeHtml(row.username) +
                    (row.leafPlus ? ' <span class="lb-plus">LEAF+</span>' : '') + '</div>' +
                '<div class="lb-podium-val">' +
                    (state.metric === 'points' ? '<img class="lb-leaf-ic" src="../assets/leaf_points.svg" alt=""> ' : '') +
                    metricLabel(row) + '</div>';
            podium.appendChild(card);
            renderInto(card.querySelector('.lb-skin'), row, true, rank);
        });

        var list = document.getElementById('lb-list');
        list.innerHTML = '';
        rest.forEach(function (row, i) {
            var rank = i + 4;
            var pct = Math.max(4, Math.round(metricValue(row) / max * 100));
            var el = document.createElement('div');
            el.className = 'lb-row';
            shown.push({ row: row, el: el });
            el.innerHTML =
                '<div class="lb-rank">' + rank + '</div>' +
                '<div class="lb-row-stage"><canvas class="lb-skin-sm" width="88" height="120"></canvas></div>' +
                '<div class="lb-info"><div class="lb-name">' + escapeHtml(row.username) +
                    (row.leafPlus ? ' <span class="lb-plus">LEAF+</span>' : '') + '</div>' +
                    '<div class="lb-bar"><span style="width:' + pct + '%"></span></div></div>' +
                '<div class="lb-val">' +
                    (state.metric === 'points' ? '<img class="lb-leaf-ic" src="../assets/leaf_points.svg" alt=""> ' : '') +
                    metricLabel(row) + '</div>';
            list.appendChild(el);
            renderInto(el.querySelector('.lb-skin-sm'), row, false, rank);
        });

        var unit = document.getElementById('lb-metric-unit');
        if (unit) unit.textContent = state.metric === 'playtime' ? 'ranked by hours played' : 'ranked by leaf points';
        markMe();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function setMetric(m) {
        if (state.metric === m) return;
        state.metric = m;
        document.querySelectorAll('.lb-toggle-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-metric') === m);
        });
        var loading = document.getElementById('lb-loading');
        if (loading) loading.style.display = 'block';
        load();
    }

    var VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

    function load() {
        var seq = ++listSeq;
        var metric = state.metric;
        fetch(API + '/leaderboard?metric=' + encodeURIComponent(metric) + '&limit=' + LIMIT, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (data) {
                if (seq !== listSeq) return;
                var arr = (data && Array.isArray(data.players)) ? data.players : [];
                state.board = data && typeof data.at === 'number' ? { metric: metric, at: data.at } : null;
                state.rows = arr.filter(function (u) {
                    return u && typeof u.username === 'string' && VALID_NAME.test(u.username);
                }).map(function (u) {
                    return {
                        rank: u.rank,
                        username: u.username,
                        playtime: Number(u.playtime) || 0,
                        coins: Number(u.coins) || 0,
                        leafPlus: u.leafPlus === true,
                        uuid: u.uuid,
                        skin: u.skin
                    };
                });
                finish(true);
                loadMe();
            })
            .catch(function () {
                if (seq !== listSeq) return;
                state.rows = []; state.board = null; finish(false); loadMe();
            });
    }

    function finish(ok) {
        var loading = document.getElementById('lb-loading');
        if (loading) loading.style.display = 'none';
        if (!state.rows.length) {
            shown = [];
            var empty = document.getElementById('lb-empty');
            if (empty) empty.style.display = 'block';
            var podium = document.getElementById('lb-podium');
            if (podium) podium.innerHTML = '';
            var list = document.getElementById('lb-list');
            if (list) list.innerHTML = '';
            return;
        }
        var e = document.getElementById('lb-empty');
        if (e) e.style.display = 'none';
        render();
    }

    document.addEventListener('lc:account', loadMe);
    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.lb-toggle-btn').forEach(function (b) {
            b.addEventListener('click', function () { setMetric(b.getAttribute('data-metric')); });
        });
        load();
    });
})();
