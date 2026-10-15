(function (global) {
    'use strict';

    var MAX_OUTLINER_DEPTH = 32;

    function readVec3(el) {
        if (el == null) return [0, 0, 0];
        if (Array.isArray(el)) return [+el[0] || 0, +el[1] || 0, +el[2] || 0];
        if (typeof el === 'object') return [+el.x || 0, +el.y || 0, +el.z || 0];
        return [0, 0, 0];
    }

    function decodeDataUrlPng(src) {
        if (!src || typeof src !== 'string') return null;
        if (src.indexOf('data:') !== 0) return null;
        if (src.indexOf(',') < 0) return null;
        return src;
    }

    function parseOutliner(el, depth, visited, groupsByUuid) {
        var node = { uuid: '', name: '', isGroup: false, origin: [0, 0, 0], rotation: [0, 0, 0], elementUuids: [], children: [] };
        if (typeof el === 'string') { node.uuid = el; node.elementUuids.push(el); return node; }
        if (depth > MAX_OUTLINER_DEPTH || el == null || typeof el !== 'object') return node;
        var u = typeof el.uuid === 'string' ? el.uuid : '';
        if (u) { if (visited.has(u)) return node; visited.add(u); }
        node.isGroup = true;
        node.uuid = u;
        var g = (u && groupsByUuid) ? groupsByUuid[u] : null;
        if (typeof el.name === 'string') node.name = el.name;
        else if (g && typeof g.name === 'string') node.name = g.name;
        node.inlineOrigin = el.origin != null ? readVec3(el.origin) : [0, 0, 0];
        node.inlineRotation = el.rotation != null ? readVec3(el.rotation) : [0, 0, 0];
        if (el.origin != null) node.origin = readVec3(el.origin);
        else if (g && g.origin != null) node.origin = readVec3(g.origin);
        if (el.rotation != null) node.rotation = readVec3(el.rotation);
        else if (g && g.rotation != null) node.rotation = readVec3(g.rotation);
        if (Array.isArray(el.children)) {
            for (var i = 0; i < el.children.length; i++) {
                var c = el.children[i];
                if (typeof c === 'string') node.elementUuids.push(c);
                else node.children.push(parseOutliner(c, depth + 1, visited, groupsByUuid));
            }
        }
        return node;
    }

    function readDp(v) {
        if (v == null) return '0';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v;
        return '0';
    }

    function parseModel(root) {
        var m = {
            meta: { boxUv: false },
            resolution: { width: 16, height: 16 },
            elements: [],
            elementsByUuid: {},
            outliner: [],
            textures: [],
            animations: []
        };
        if (root.meta && root.meta.box_uv != null) m.meta.boxUv = !!root.meta.box_uv;
        if (root.resolution) {
            if (root.resolution.width) m.resolution.width = +root.resolution.width || 16;
            if (root.resolution.height) m.resolution.height = +root.resolution.height || 16;
        }
        if (Array.isArray(root.elements)) {
            for (var i = 0; i < root.elements.length; i++) {
                var o = root.elements[i];
                if (!o || typeof o !== 'object') continue;
                var e = {
                    uuid: typeof o.uuid === 'string' ? o.uuid : '',
                    name: typeof o.name === 'string' ? o.name : '',
                    type: typeof o.type === 'string' ? o.type : 'cube',
                    from: o.from ? readVec3(o.from) : [0, 0, 0],
                    to: o.to ? readVec3(o.to) : [0, 0, 0],
                    origin: o.origin ? readVec3(o.origin) : [0, 0, 0],
                    rotation: o.rotation ? readVec3(o.rotation) : [0, 0, 0],
                    inflate: +o.inflate || 0,
                    boxUv: o.box_uv != null ? !!o.box_uv : m.meta.boxUv,
                    uvOffset: Array.isArray(o.uv_offset) ? [+o.uv_offset[0] || 0, +o.uv_offset[1] || 0] : [0, 0],
                    faces: {},
                    vertices: null
                };
                if (o.vertices && typeof o.vertices === 'object' && !Array.isArray(o.vertices)) {
                    var verts = {};
                    var vertKeys = Object.keys(o.vertices);
                    for (var vk = 0; vk < vertKeys.length; vk++) {
                        var vRaw = o.vertices[vertKeys[vk]];
                        if (!Array.isArray(vRaw)) continue;
                        verts[vertKeys[vk]] = readVec3(vRaw);
                    }
                    if (vertKeys.length > 0) e.vertices = verts;
                }
                if (o.faces && typeof o.faces === 'object') {
                    var faceKeys = Object.keys(o.faces);
                    for (var fk = 0; fk < faceKeys.length; fk++) {
                        var key = faceKeys[fk];
                        var fo = o.faces[key];
                        if (!fo || typeof fo !== 'object') continue;
                        var face = {
                            uv: Array.isArray(fo.uv) ? [+fo.uv[0] || 0, +fo.uv[1] || 0, +fo.uv[2] || 0, +fo.uv[3] || 0] : null,
                            textureIndex: Number.isFinite(+fo.texture) ? +fo.texture : 0,
                            rotation: +fo.rotation || 0,
                            meshVertices: null,
                            meshUv: null
                        };
                        if (Array.isArray(fo.vertices)) {
                            var mvKeys = [];
                            for (var mv = 0; mv < fo.vertices.length; mv++) {
                                if (typeof fo.vertices[mv] === 'string') mvKeys.push(fo.vertices[mv]);
                            }
                            if (mvKeys.length > 0) face.meshVertices = mvKeys;
                        }
                        if (fo.uv && typeof fo.uv === 'object' && !Array.isArray(fo.uv)) {
                            var mu = {};
                            var muKeys = Object.keys(fo.uv);
                            for (var mk = 0; mk < muKeys.length; mk++) {
                                var pair = fo.uv[muKeys[mk]];
                                if (!Array.isArray(pair) || pair.length < 2) continue;
                                mu[muKeys[mk]] = [+pair[0] || 0, +pair[1] || 0];
                            }
                            face.meshUv = mu;
                        }
                        e.faces[key] = face;
                    }
                }
                m.elements.push(e);
                if (e.uuid) m.elementsByUuid[e.uuid] = e;
            }
        }
        if (Array.isArray(root.outliner)) {
            var groupsByUuid = null;
            if (Array.isArray(root.groups)) {
                groupsByUuid = {};
                for (var gi = 0; gi < root.groups.length; gi++) {
                    var go = root.groups[gi];
                    if (go && typeof go.uuid === 'string') groupsByUuid[go.uuid] = go;
                }
            }
            var visited = new Set();
            for (var oi = 0; oi < root.outliner.length; oi++) {
                m.outliner.push(parseOutliner(root.outliner[oi], 0, visited, groupsByUuid));
            }
        }
        if (Array.isArray(root.textures)) {
            for (var ti = 0; ti < root.textures.length; ti++) {
                var to = root.textures[ti];
                if (!to || typeof to !== 'object') continue;
                m.textures.push({
                    name: typeof to.name === 'string' ? to.name : '',
                    source: typeof to.source === 'string' ? to.source : '',
                    frameTime: +to.frame_time || 0,
                    dataUrl: decodeDataUrlPng(to.source)
                });
            }
        }
        var legacyAnimAxes = parseFloat((root.meta && root.meta.format_version) || '5') < 5;
        if (Array.isArray(root.animations)) {
            for (var ai = 0; ai < root.animations.length; ai++) {
                var ao = root.animations[ai];
                if (!ao || typeof ao !== 'object') continue;
                var anim = { name: typeof ao.name === 'string' ? ao.name : '', loop: typeof ao.loop === 'string' ? ao.loop : 'loop', length: +ao.length || 0, animators: {} };
                if (ao.animators && typeof ao.animators === 'object') {
                    var animKeys = Object.keys(ao.animators);
                    for (var ak = 0; ak < animKeys.length; ak++) {
                        var boneUuid = animKeys[ak];
                        var an = ao.animators[boneUuid];
                        if (!an) continue;
                        var keyframes = [];
                        if (Array.isArray(an.keyframes)) {
                            for (var ki = 0; ki < an.keyframes.length; ki++) {
                                var ko = an.keyframes[ki];
                                if (!ko) continue;
                                var dp = Array.isArray(ko.data_points) && ko.data_points[0] ? ko.data_points[0] : null;
                                var kfEntry = {
                                    channel: typeof ko.channel === 'string' ? ko.channel : 'rotation',
                                    time: +ko.time || 0,
                                    interpolation: typeof ko.interpolation === 'string' ? ko.interpolation : 'linear',
                                    dp: dp ? [readDp(dp.x), readDp(dp.y), readDp(dp.z)] : ['0', '0', '0'],
                                    bezierLeftTime: readTriple(ko.bezier_left_time),
                                    bezierLeftValue: readTriple(ko.bezier_left_value),
                                    bezierRightTime: readTriple(ko.bezier_right_time),
                                    bezierRightValue: readTriple(ko.bezier_right_value)
                                };
                                if (legacyAnimAxes) applyLegacyAxisFlip(kfEntry);
                                keyframes.push(kfEntry);
                            }
                        }
                        keyframes.sort(function (a, b) { return a.time - b.time; });
                        anim.animators[boneUuid] = { name: typeof an.name === 'string' ? an.name : '', keyframes: keyframes };
                    }
                }
                m.animations.push(anim);
            }
        }
        return m;
    }

    function evalMolang(expr, vars) {
        if (expr == null) return 0;
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') return 0;
        var s = expr.trim();
        if (!s) return 0;
        var n = +s;
        if (Number.isFinite(n)) return n;
        var ctx = { s: s, i: 0, vars: vars || {} };
        try { var v = parseExpr(ctx); return Number.isFinite(v) ? v : 0; } catch (_e) { return 0; }
    }
    function peekChar(c) { return c.s.charAt(c.i); }
    function skipWs(c) { while (c.i < c.s.length && /\s/.test(c.s.charAt(c.i))) c.i++; }
    function eat(c, ch) { skipWs(c); if (c.s.charAt(c.i) === ch) { c.i++; return true; } return false; }
    function parseExpr(c) { return parseTern(c); }
    function parseTern(c) { var cond = parseOr(c); skipWs(c); if (peekChar(c) === '?') { c.i++; var a = parseExpr(c); eat(c, ':'); var b = parseExpr(c); return cond ? a : b; } return cond; }
    function parseOr(c) { var v = parseAnd(c); while (true) { skipWs(c); if (c.s.substr(c.i, 2) === '||') { c.i += 2; v = (v || parseAnd(c)) ? 1 : 0; } else break; } return v; }
    function parseAnd(c) { var v = parseCmp(c); while (true) { skipWs(c); if (c.s.substr(c.i, 2) === '&&') { c.i += 2; v = (v && parseCmp(c)) ? 1 : 0; } else break; } return v; }
    function parseCmp(c) {
        var v = parseAdd(c);
        while (true) {
            skipWs(c);
            var two = c.s.substr(c.i, 2);
            if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
                c.i += 2; var r = parseAdd(c);
                if (two === '==') v = v === r ? 1 : 0;
                else if (two === '!=') v = v !== r ? 1 : 0;
                else if (two === '<=') v = v <= r ? 1 : 0;
                else v = v >= r ? 1 : 0;
            } else if (peekChar(c) === '<' || peekChar(c) === '>') {
                var op = peekChar(c); c.i++; var r2 = parseAdd(c);
                v = op === '<' ? (v < r2 ? 1 : 0) : (v > r2 ? 1 : 0);
            } else break;
        }
        return v;
    }
    function parseAdd(c) { var v = parseMul(c); while (true) { skipWs(c); var p = peekChar(c); if (p === '+') { c.i++; v += parseMul(c); } else if (p === '-') { c.i++; v -= parseMul(c); } else break; } return v; }
    function parseMul(c) { var v = parseUnary(c); while (true) { skipWs(c); var p = peekChar(c); if (p === '*') { c.i++; v *= parseUnary(c); } else if (p === '/') { c.i++; var d = parseUnary(c); v = d === 0 ? 0 : v / d; } else if (p === '%') { c.i++; var d2 = parseUnary(c); v = d2 === 0 ? 0 : v % d2; } else break; } return v; }
    function parseUnary(c) { skipWs(c); if (peekChar(c) === '-') { c.i++; return -parseUnary(c); } if (peekChar(c) === '+') { c.i++; return parseUnary(c); } if (peekChar(c) === '!') { c.i++; return parseUnary(c) ? 0 : 1; } return parseAtom(c); }
    function parseAtom(c) {
        skipWs(c);
        if (peekChar(c) === '(') { c.i++; var v = parseExpr(c); eat(c, ')'); return v; }
        var ch = peekChar(c);
        if ((ch >= '0' && ch <= '9') || ch === '.') { var start = c.i; while (c.i < c.s.length && /[0-9.]/.test(c.s.charAt(c.i))) c.i++; return +c.s.substring(start, c.i); }
        var idStart = c.i;
        while (c.i < c.s.length && /[A-Za-z0-9_.]/.test(c.s.charAt(c.i))) c.i++;
        var ident = c.s.substring(idStart, c.i);
        skipWs(c);
        if (peekChar(c) === '(') {
            c.i++; var args = []; skipWs(c);
            if (peekChar(c) !== ')') { args.push(parseExpr(c)); while (eat(c, ',')) args.push(parseExpr(c)); }
            eat(c, ')'); return callFn(ident, args, c.vars);
        }
        return resolveVar(ident, c.vars);
    }
    function callFn(name, args, vars) {
        var a0 = args[0] || 0, a1 = args[1] || 0, a2 = args[2] || 0;
        switch (name) {
            case 'math.abs': return Math.abs(a0);
            case 'math.acos': return Math.acos(a0) * 180 / Math.PI;
            case 'math.asin': return Math.asin(a0) * 180 / Math.PI;
            case 'math.atan': return Math.atan(a0) * 180 / Math.PI;
            case 'math.atan2': return Math.atan2(a0, a1) * 180 / Math.PI;
            case 'math.ceil': return Math.ceil(a0);
            case 'math.cos': return Math.cos(a0 * Math.PI / 180);
            case 'math.exp': return Math.exp(a0);
            case 'math.floor': return Math.floor(a0);
            case 'math.ln': return a0 <= 0 ? 0 : Math.log(a0);
            case 'math.mod': return a1 === 0 ? 0 : a0 % a1;
            case 'math.max': return Math.max(a0, a1);
            case 'math.min': return Math.min(a0, a1);
            case 'math.clamp': return Math.max(a1, Math.min(a2, a0));
            case 'math.lerp': return a0 + (a1 - a0) * a2;
            case 'math.pi': return Math.PI;
            case 'math.pow': return Math.pow(a0, a1);
            case 'math.random': { var lo = args.length > 0 ? a0 : 0; var hi = args.length > 1 ? a1 : 1; return lo + Math.random() * (hi - lo); }
            case 'math.round': return Math.round(a0);
            case 'math.sin': return Math.sin(a0 * Math.PI / 180);
            case 'math.sqrt': return Math.sqrt(Math.max(0, a0));
            case 'math.die_roll': { var n = Math.max(0, Math.min(1000, a0 | 0)); var sum = 0; for (var i = 0; i < n; i++) sum += a1 + Math.random() * (a2 - a1); return sum; }
            default: return 0;
        }
    }
    function resolveVar(name, vars) {
        switch (name) {
            case 'query.anim_time':
            case 'q.anim_time':
            case 'query.life_time':
            case 'q.life_time':
                return vars.time || 0;
            case 'true': return 1;
            case 'false': return 0;
        }
        if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
        return 0;
    }

    function readTriple(v) {
        if (!Array.isArray(v)) return null;
        return [+v[0] || 0, +v[1] || 0, +v[2] || 0];
    }

    function negateExpr(s) {
        var n = parseFloat(s);
        if (typeof s === 'string' && s.trim() !== '' && String(n) === s.trim()) return String(-n);
        if (!s || s === '0') return '0';
        return '-(' + s + ')';
    }

    function applyLegacyAxisFlip(kf) {
        var axes = kf.channel === 'rotation' ? [0, 1] : (kf.channel === 'position' ? [0] : []);
        for (var i = 0; i < axes.length; i++) {
            var ax = axes[i];
            kf.dp[ax] = negateExpr(kf.dp[ax]);
            if (kf.bezierLeftValue) kf.bezierLeftValue[ax] = -kf.bezierLeftValue[ax];
            if (kf.bezierRightValue) kf.bezierRightValue[ax] = -kf.bezierRightValue[ax];
        }
    }

    function cubicBezier(t, p0, p1, p2, p3) {
        var k = 1 - t;
        return k*k*k*p0 + 3*k*k*t*p1 + 3*k*t*t*p2 + t*t*t*p3;
    }

    function bezierValue(before, after, ax, alpha, valBefore, valAfter) {
        var timeGap = after.time - before.time;
        var hb = before.bezierRightTime ? before.bezierRightTime[ax] : 0;
        var ha = after.bezierLeftTime ? after.bezierLeftTime[ax] : 0;
        if (hb < 0) hb = 0; else if (hb > timeGap) hb = timeGap;
        if (ha < -timeGap) ha = -timeGap; else if (ha > 0) ha = 0;
        var vb = before.bezierRightValue ? before.bezierRightValue[ax] : 0;
        var va = after.bezierLeftValue ? after.bezierLeftValue[ax] : 0;
        var x0 = before.time, y0 = valBefore;
        var x1 = before.time + hb, y1 = (valBefore + vb) || 0;
        var x2 = after.time + ha, y2 = (valAfter + va) || 0;
        var x3 = after.time, y3 = valAfter;
        var target = before.time + timeGap * alpha;
        var bestX = 0, bestY = 0, bestD = Infinity;
        var secX = 0, secY = 0, secD = Infinity;
        for (var i = 0; i <= 200; i++) {
            var s = i / 200;
            var px = cubicBezier(s, x0, x1, x2, x3);
            var d = Math.abs(px - target);
            if (d < bestD) { bestD = d; bestX = px; bestY = cubicBezier(s, y0, y1, y2, y3); }
        }
        for (var j = 0; j <= 200; j++) {
            var s2 = j / 200;
            var px2 = cubicBezier(s2, x0, x1, x2, x3);
            if (px2 === bestX) continue;
            var d2 = Math.abs(px2 - target);
            if (d2 < secD) { secD = d2; secX = px2; secY = cubicBezier(s2, y0, y1, y2, y3); }
        }
        if (secD === Infinity) return bestY;
        var span = secX - bestX;
        var f = span !== 0 ? (target - bestX) / span : 0;
        if (f < 0) f = 0; else if (f > 1) f = 1;
        return bestY + (secY - bestY) * f;
    }

    function catmullRom(t, p0, p1, p2, p3) {
        var v0 = (p2 - p0) * 0.5;
        var v1 = (p3 - p1) * 0.5;
        var t2 = t * t, t3 = t * t2;
        return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
    }

    function splinePoint(vals, u) {
        var n = vals.length;
        if (n < 2) return vals[0];
        var p = (n - 1) * u;
        var i = Math.floor(p);
        if (i > n - 1) i = n - 1;
        if (i < 0) i = 0;
        var w = p - i;
        var p0 = vals[i === 0 ? i : i - 1];
        var p1 = vals[i];
        var p2 = vals[i > n - 2 ? n - 1 : i + 1];
        var p3 = vals[i > n - 3 ? n - 1 : i + 2];
        return catmullRom(w, p0, p1, p2, p3);
    }

    function evalKeyframeChannel(animator, channel, time, defaultValue, anim) {
        var kfs = [];
        for (var i = 0; i < animator.keyframes.length; i++) if (animator.keyframes[i].channel === channel) kfs.push(animator.keyframes[i]);
        if (kfs.length === 0) return defaultValue.slice();
        kfs.sort(function (a, b) { return a.time - b.time; });

        var looped = !!(anim && anim.loop === 'loop');
        var eps = 1 / 1200;

        var before = null, after = null, beforeTime = 0, afterTime = 0, beforeIndex = -1;
        for (var k = 0; k < kfs.length; k++) {
            var kf = kfs[k];
            if (kf.time < time) {
                if (!before || kf.time > beforeTime) { before = kf; beforeTime = kf.time; beforeIndex = k; }
            } else if (!after || kf.time < afterTime) {
                after = kf; afterTime = kf.time;
            }
        }
        if (before && Math.abs(beforeTime - time) < eps) return evalDp(before.dp, time);
        if (after && Math.abs(afterTime - time) < eps) return evalDp(after.dp, time);
        if (before && before.interpolation === 'step') return evalDp(before.dp, time);
        if (before && !after) return evalDp(before.dp, time);
        if (after && !before) return evalDp(after.dp, time);
        if (!before || !after) return defaultValue.slice();

        var span = afterTime - beforeTime;
        var alpha = span > 0 ? (time - beforeTime) / span : 0;
        var av = evalDp(before.dp, time);
        var bv = evalDp(after.dp, time);

        if (before.interpolation === 'catmullrom' || after.interpolation === 'catmullrom') {
            var beforePlus = kfs[beforeIndex - 1];
            var afterPlus = kfs[beforeIndex + 2];
            if (looped && kfs.length >= 3) {
                if (!beforePlus) beforePlus = kfs[kfs.length - 2];
                if (!afterPlus) afterPlus = kfs[1];
            }
            var pv = beforePlus ? evalDp(beforePlus.dp, time) : null;
            var nv = afterPlus ? evalDp(afterPlus.dp, time) : null;
            var out = [0, 0, 0];
            for (var ax = 0; ax < 3; ax++) {
                var pts = [];
                if (pv) pts.push(pv[ax]);
                pts.push(av[ax]);
                pts.push(bv[ax]);
                if (nv) pts.push(nv[ax]);
                out[ax] = splinePoint(pts, (alpha + (pv ? 1 : 0)) / (pts.length - 1));
            }
            return out;
        }

        if (before.interpolation === 'bezier' || after.interpolation === 'bezier') {
            return [
                bezierValue(before, after, 0, alpha, av[0], bv[0]),
                bezierValue(before, after, 1, alpha, av[1], bv[1]),
                bezierValue(before, after, 2, alpha, av[2], bv[2])
            ];
        }

        return [av[0] + (bv[0] - av[0]) * alpha, av[1] + (bv[1] - av[1]) * alpha, av[2] + (bv[2] - av[2]) * alpha];
    }
    function evalDp(dp, time) {
        var vars = { time: time };
        return [evalMolang(dp[0], vars), evalMolang(dp[1], vars), evalMolang(dp[2], vars)];
    }

    function loadDataUrlImage(dataUrl) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('data url load failed')); };
            img.src = dataUrl;
        });
    }

    var MIN_SMOOTH_BLOCK = 4;

    function looksContinuous(data, block) {
        if (!block || block < MIN_SMOOTH_BLOCK) return false;
        var w = data.width, hh = Math.min(data.width, data.height), d = data.data;
        var checked = 0, differ = 0;
        for (var by = 0; by + block <= hh; by += block) {
            for (var bx = 0; bx + block <= w; bx += block) {
                var base = (by * w + bx) * 4;
                var r = d[base], g = d[base + 1], b = d[base + 2], a = d[base + 3];
                for (var oy = 0; oy < block; oy++) {
                    for (var ox = 0; ox < block; ox++) {
                        var i2 = ((by + oy) * w + bx + ox) * 4;
                        checked++;
                        if (d[i2] !== r || d[i2 + 1] !== g || d[i2 + 2] !== b || d[i2 + 3] !== a) differ++;
                    }
                }
            }
        }
        return checked > 0 && differ / checked > 0.08;
    }

    function loadModelTextures(parsed) {
        var uvW = (parsed.resolution && parsed.resolution.width) ? parsed.resolution.width : 16;
        var promises = [];
        for (var i = 0; i < parsed.textures.length; i++) {
            var d = parsed.textures[i].dataUrl;
            if (d) promises.push(loadDataUrlImage(d).then((function (texMeta) { return function (img) {
                var c = document.createElement('canvas');
                c.width = img.naturalWidth || img.width;
                c.height = img.naturalHeight || img.height;
                var ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var data = ctx.getImageData(0, 0, c.width, c.height);
                var fc = (c.height > c.width && c.height % c.width === 0) ? c.height / c.width : 1;
                data.frameCount = fc;
                data.frameH = c.height / fc;
                data.frameTime = texMeta.frameTime || 1;
                data.smooth = looksContinuous(data, Math.round(c.width / uvW));
                return data;
            }; })(parsed.textures[i])).catch(function () { return null; }));
            else promises.push(Promise.resolve(null));
        }
        return Promise.all(promises);
    }

    global.LeafBBModel = {
        parseModel: parseModel,
        evalKeyframeChannel: evalKeyframeChannel,
        loadModelTextures: loadModelTextures,
        looksContinuous: looksContinuous
    };
})(window);
