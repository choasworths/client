(function (global) {
    'use strict';

    function strandSpike(tt, strandIdx) {
        var cycle = 3.2 + (strandIdx % 3) * 0.55;
        var offset = strandIdx * 1.27;
        var local = ((tt + offset) % cycle) / cycle;
        var window = 0.16;
        if (local > window) return 0;
        return Math.sin((local / window) * Math.PI);
    }

    var API_BASE = 'https://api.leafclient.com';
    var modelCache = Object.create(null);
    var UUID_HEX = /^[0-9a-f]{32}$/;

    function loadModelByUuid(uuid) {
        var key = String(uuid || '').toLowerCase();
        if (!UUID_HEX.test(key)) return Promise.resolve(null);
        if (modelCache[key]) return modelCache[key];
        modelCache[key] = fetch(API_BASE + '/skin/' + key)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { return j && typeof j.slim === 'boolean' ? j.slim : null; })
            .catch(function () { return null; });
        return modelCache[key];
    }

    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Failed to load ' + url)); };
            img.src = url;
        });
    }

    function imageToData(img) {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
    }

    function getPixel(img, x, y) {
        if (!img || x < 0 || x >= img.width || y < 0 || y >= img.height) return null;
        var i = (y * img.width + x) * 4;
        return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    }

    var ALPHA_FLOOR = 32;
    var FLAT_FACE_GAP = 0.001;

    var WIDE_ARM_ONLY = [
        [50, 16, 2, 4],
        [54, 20, 2, 12],
        [42, 48, 2, 4],
        [46, 52, 2, 12]
    ];

    var SLIM_ARM_AREA = [
        [44, 16, 6, 4],
        [40, 20, 14, 12],
        [36, 48, 6, 4],
        [32, 52, 14, 12]
    ];

    function areaHasColour(d, areas) {
        for (var r = 0; r < areas.length; r++) {
            var area = areas[r];
            for (var y = area[1]; y < area[1] + area[3]; y++) {
                for (var x = area[0]; x < area[0] + area[2]; x++) {
                    var i = (y * 64 + x) * 4;
                    if (d[i + 3] > ALPHA_FLOOR && (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0)) return true;
                }
            }
        }
        return false;
    }

    function hasWideArms(skin) {
        if (!skin || !skin.data || skin.width !== 64 || skin.height < 64) return true;
        var d = skin.data;
        if (areaHasColour(d, WIDE_ARM_ONLY)) return true;
        var blackFiller = false;
        for (var r = 0; r < WIDE_ARM_ONLY.length && !blackFiller; r++) {
            var area = WIDE_ARM_ONLY[r];
            for (var y = area[1]; y < area[1] + area[3] && !blackFiller; y++) {
                for (var x = area[0]; x < area[0] + area[2]; x++) {
                    if (d[(y * 64 + x) * 4 + 3] > ALPHA_FLOOR) { blackFiller = true; break; }
                }
            }
        }
        return blackFiller && !areaHasColour(d, SLIM_ARM_AREA);
    }

    var zScratch = Object.create(null);
    var zKeys = [];
    var bodyCache = [];
    var bodyMisses = [];
    var skinTags = new WeakMap();
    var skinSeq = 0;
    function skinTag(img) {
        var t = skinTags.get(img);
        if (!t) { t = ++skinSeq; skinTags.set(img, t); }
        return t;
    }

    function downsample(src, sw, factor, dw, dh) {
        var out = new Uint8ClampedArray(dw * dh * 4);
        var n = factor * factor;
        for (var y = 0; y < dh; y++) {
            for (var x = 0; x < dw; x++) {
                var sr = 0, sg = 0, sb = 0, sa = 0;
                for (var oy = 0; oy < factor; oy++) {
                    var row = ((y * factor + oy) * sw + x * factor) * 4;
                    for (var ox = 0; ox < factor; ox++) {
                        var i = row + ox * 4;
                        var a = src[i + 3];
                        sr += src[i] * a; sg += src[i + 1] * a; sb += src[i + 2] * a; sa += a;
                    }
                }
                var o = (y * dw + x) * 4;
                if (sa > 0) {
                    out[o] = sr / sa; out[o + 1] = sg / sa; out[o + 2] = sb / sa; out[o + 3] = sa / n;
                }
            }
        }
        return new ImageData(out, dw, dh);
    }

    function renderFrame(skin, cape, hat, wings, w, h, opt) {
        if (!skin || w <= 0 || h <= 0) return null;
        opt = opt || {};
        var ssaa = opt.ssaa > 1 ? Math.min(4, opt.ssaa | 0) : 1;
        var outW = w, outH = h;
        if (ssaa > 1) { w = w * ssaa; h = h * ssaa; }

        var rotationY = opt.rotationY || 0;
        var rotationX = opt.rotationX || 0;
        var zoom = opt.zoom || 1;
        var leftArmPitch = (opt.leftArmPitch || 0) * Math.PI / 180;
        var rightArmPitch = (opt.rightArmPitch || 0) * Math.PI / 180;
        var leftLegPitch = (opt.leftLegPitch || 0) * Math.PI / 180;
        var rightLegPitch = (opt.rightLegPitch || 0) * Math.PI / 180;
        var headYaw = (opt.headYaw || 0) * Math.PI / 180;
        var capeSwingX = opt.capeSwingX || 0;
        var wingFlapPhase = opt.wingFlapPhase || 0;
        var isHorns = !!opt.isHorns;
        var auraType = opt.auraType || null;
        var auraPhase = opt.auraPhase || 0;
        var bbmodelTime = opt.bbmodelTime || 0;
        var cameraDist = +opt.cameraDist || 60;
        var hideHeadLayer = !!opt.hideHeadLayer;

        var stride = w * 4;
        var buf = new Uint8ClampedArray(h * stride);
        var zKey = w + 'x' + h;
        var zBuf = zScratch[zKey];
        if (!zBuf) {
            zBuf = zScratch[zKey] = new Float32Array(h * w);
            zKeys.push(zKey);
            if (zKeys.length > 4) delete zScratch[zKeys.shift()];
        }
        zBuf.fill(1e9);

        var radY = rotationY * Math.PI / 180;
        var radX = rotationX * Math.PI / 180;
        var cosY = Math.cos(radY), sinY = Math.sin(radY);
        var cosX = Math.cos(radX), sinX = Math.sin(radX);

        var scale = (h / 48) * zoom;
        var cx = w / 2;
        var cy = h * 0.48;

        function project(p) {
            var px = p[0], py = p[1], pz = p[2];
            var x1 = px * cosY - pz * sinY;
            var z1 = px * sinY + pz * cosY;
            var y2 = py * cosX - z1 * sinX;
            var z2 = py * sinX + z1 * cosX;
            var persp = cameraDist / (cameraDist + z2);
            return [cx + x1 * scale * persp, cy - y2 * scale * persp, z2];
        }

        function setPixel(x, y, r, g, b, a, shade) {
            var off = y * stride + x * 4;
            var sr = (r * shade) | 0;
            var sg = (g * shade) | 0;
            var sb = (b * shade) | 0;
            if (sr > 255) sr = 255; if (sg > 255) sg = 255; if (sb > 255) sb = 255;
            if (a >= 255) {
                buf[off] = sr; buf[off + 1] = sg; buf[off + 2] = sb; buf[off + 3] = 255;
            } else {
                var af = a / 255;
                var inv = 1 - af;
                buf[off] = (sr * af + buf[off] * inv) | 0;
                buf[off + 1] = (sg * af + buf[off + 1] * inv) | 0;
                buf[off + 2] = (sb * af + buf[off + 2] * inv) | 0;
                var na = a + buf[off + 3] * inv;
                buf[off + 3] = na > 255 ? 255 : na | 0;
            }
        }

        function rasterQuad(P0, P1, P2, P3, cull, sample) {
            var x0 = P0[0], y0 = P0[1], z0 = P0[2];
            var x1 = P1[0], y1 = P1[1], z1 = P1[2];
            var x2 = P2[0], y2 = P2[1], z2 = P2[2];
            var x3 = P3[0], y3 = P3[1], z3 = P3[2];


            var minX = Math.min(x0, x1, x2, x3);
            var maxX = Math.max(x0, x1, x2, x3);
            var minY = Math.min(y0, y1, y2, y3);
            var maxY = Math.max(y0, y1, y2, y3);
            var xa = Math.max(0, Math.floor(minX));
            var xb = Math.min(w - 1, Math.ceil(maxX));
            var ya = Math.max(0, Math.floor(minY));
            var yb = Math.min(h - 1, Math.ceil(maxY));
            if (xa > xb || ya > yb) return;

            function tri(ax, ay, az, bx, by, bz, cx_, cy_, cz, ua, va, ub, vb, uc, vc) {
                var ex1 = bx - ax, ey1 = by - ay;
                var ex2 = cx_ - ax, ey2 = cy_ - ay;
                var denom = ex1 * ey2 - ex2 * ey1;
                if (denom === 0) return;
                var invDen = 1 / denom;
                var iwA = 1 / (cameraDist + az), iwB = 1 / (cameraDist + bz), iwC = 1 / (cameraDist + cz);
                var uwA = ua * iwA, vwA = va * iwA;
                var uwB = ub * iwB, vwB = vb * iwB;
                var uwC = uc * iwC, vwC = vc * iwC;

                var triMinX = Math.max(xa, Math.floor(Math.min(ax, bx, cx_)));
                var triMaxX = Math.min(xb, Math.ceil(Math.max(ax, bx, cx_)));
                var triMinY = Math.max(ya, Math.floor(Math.min(ay, by, cy_)));
                var triMaxY = Math.min(yb, Math.ceil(Math.max(ay, by, cy_)));

                for (var py = triMinY; py <= triMaxY; py++) {
                    var fy = py + 0.5;
                    for (var px = triMinX; px <= triMaxX; px++) {
                        var fx = px + 0.5;
                        var dx = fx - ax, dy = fy - ay;
                        var u = (dx * ey2 - dy * ex2) * invDen;
                        var v = (dy * ex1 - dx * ey1) * invDen;
                        if (u < 0 || v < 0 || u + v > 1) continue;
                        var aw = 1 - u - v;
                        var pz = aw * az + u * bz + v * cz;
                        var zIdx = py * w + px;
                        if (pz >= zBuf[zIdx]) continue;
                        var iw = aw * iwA + u * iwB + v * iwC;
                        var tu = (aw * uwA + u * uwB + v * uwC) / iw;
                        var tv = (aw * vwA + u * vwB + v * vwC) / iw;
                        sample(px, py, pz, zIdx, tu, tv);
                    }
                }
            }

            tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, 0, 0, 1, 0, 1, 1);
            tri(x0, y0, z0, x2, y2, z2, x3, y3, z3, 0, 0, 1, 1, 0, 1);
        }

        function rotatePt(p, pivotX, pivotY, pivotZ, angle, axis) {
            var dx = p[0] - pivotX, dy = p[1] - pivotY, dz = p[2] - pivotZ;
            var c = Math.cos(angle), s = Math.sin(angle);
            if (axis === 0) {
                return [pivotX + dx, pivotY + dy * c - dz * s, pivotZ + dy * s + dz * c];
            } else {
                return [pivotX + dx * c - dz * s, pivotY + dy, pivotZ + dx * s + dz * c];
            }
        }

        function drawTexFacePosed(tex, tl, tr, br, bl, uvX, uvY, uvW, uvH, shade, cull, pivX, pivY, pivZ, angle, axis) {
            if (angle) {
                tl = rotatePt(tl, pivX, pivY, pivZ, angle, axis);
                tr = rotatePt(tr, pivX, pivY, pivZ, angle, axis);
                br = rotatePt(br, pivX, pivY, pivZ, angle, axis);
                bl = rotatePt(bl, pivX, pivY, pivZ, angle, axis);
            }
            drawTexFace(tex, tl, tr, br, bl, uvX, uvY, uvW, uvH, shade, cull);
        }

        function drawBoxPosed(tex, ox, oy, oz, sx, sy, sz, uvX, uvY, uvW, uvH, uvD, skipFaces, mirror, pivX, pivY, pivZ, angle, axis) {
            skipFaces = skipFaces || 0;
            var x0 = ox, x1 = ox + sx, y0 = oy, y1 = oy + sy, z0 = oz, z1 = oz + sz;
            var uLeft, uRight;
            if (mirror) { uLeft = uvX + uvD + uvW; uRight = uvX + uvD; }
            else { uLeft = uvX + uvD; uRight = uvX + uvD + uvW; }
            var uFront = mirror ? -uvW : uvW;
            var uSide = mirror ? -uvD : uvD;
            if (!(skipFaces & 4))
                drawTexFacePosed(tex, [x0,y1,z1],[x1,y1,z1],[x1,y0,z1],[x0,y0,z1], uLeft, uvY+uvD, uFront, uvH, 1.0, true, pivX, pivY, pivZ, angle, axis);
            if (!(skipFaces & 8))
                drawTexFacePosed(tex, [x1,y1,z0],[x0,y1,z0],[x0,y0,z0],[x1,y0,z0], mirror?uvX:uvX+uvD+uvW+uvD, uvY+uvD, uFront, uvH, 0.55, true, pivX, pivY, pivZ, angle, axis);
            if (!(skipFaces & 16))
                drawTexFacePosed(tex, [x0,y1,z0],[x0,y1,z1],[x0,y0,z1],[x0,y0,z0], mirror?uvX+uvD+uvW:uvX, uvY+uvD, uSide, uvH, 0.7, true, pivX, pivY, pivZ, angle, axis);
            if (!(skipFaces & 32))
                drawTexFacePosed(tex, [x1,y1,z1],[x1,y1,z0],[x1,y0,z0],[x1,y0,z1], mirror?uvX+uvD:uvX+uvD+uvW, uvY+uvD, uSide, uvH, 0.7, true, pivX, pivY, pivZ, angle, axis);
            if (!(skipFaces & 1))
                drawTexFacePosed(tex, [x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], uLeft, uvY, uFront, uvD, 0.85, true, pivX, pivY, pivZ, angle, axis);
            if (!(skipFaces & 2))
                drawTexFacePosed(tex, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], uLeft+uFront, uvY, uFront, uvD, 0.5, true, pivX, pivY, pivZ, angle, axis);
        }

        function drawTexFace(tex, tl, tr, br, bl, uvX, uvY, uvW, uvH, shade, cull) {
            if (!tex) return;
            var P0 = project(tl), P1 = project(tr), P2 = project(br), P3 = project(bl);

            var td = tex.data, tw = tex.width, th = tex.height;
            var smooth = !!tex.smooth && uvW > 0 && uvH > 0;
            rasterQuad(P0, P1, P2, P3, !!cull, function (px, py, pz, zIdx, tu, tv) {
                if (tu < 0) tu = 0; else if (tu > 1) tu = 1;
                if (tv < 0) tv = 0; else if (tv > 1) tv = 1;
                if (smooth) {
                    var gu = uvX + tu * uvW - 0.5, gv = uvY + tv * uvH - 0.5;
                    var gx0 = Math.floor(gu), gy0 = Math.floor(gv);
                    var wx = gu - gx0, wy = gv - gy0;
                    var gx1 = gx0 + 1, gy1 = gy0 + 1;
                    var xMax = uvX + uvW - 1, yMax = uvY + uvH - 1;
                    if (gx0 < uvX) gx0 = uvX; else if (gx0 > xMax) gx0 = xMax;
                    if (gx1 < uvX) gx1 = uvX; else if (gx1 > xMax) gx1 = xMax;
                    if (gy0 < uvY) gy0 = uvY; else if (gy0 > yMax) gy0 = yMax;
                    if (gy1 < uvY) gy1 = uvY; else if (gy1 > yMax) gy1 = yMax;
                    if (gx0 < 0 || gx1 >= tw || gy0 < 0 || gy1 >= th) return;
                    var i00 = (gy0 * tw + gx0) * 4, i10 = (gy0 * tw + gx1) * 4;
                    var i01 = (gy1 * tw + gx0) * 4, i11 = (gy1 * tw + gx1) * 4;
                    var a00 = td[i00 + 3] * (1 - wx) * (1 - wy);
                    var a10 = td[i10 + 3] * wx * (1 - wy);
                    var a01 = td[i01 + 3] * (1 - wx) * wy;
                    var a11 = td[i11 + 3] * wx * wy;
                    var aSum = a00 + a10 + a01 + a11;
                    if (aSum < 2) return;
                    zBuf[zIdx] = pz;
                    setPixel(px, py,
                        (td[i00] * a00 + td[i10] * a10 + td[i01] * a01 + td[i11] * a11) / aSum,
                        (td[i00 + 1] * a00 + td[i10 + 1] * a10 + td[i01 + 1] * a01 + td[i11 + 1] * a11) / aSum,
                        (td[i00 + 2] * a00 + td[i10 + 2] * a10 + td[i01 + 2] * a01 + td[i11 + 2] * a11) / aSum,
                        aSum, shade);
                    return;
                }
                var su = uvX + Math.floor(tu * uvW);
                var sv = uvY + Math.floor(tv * uvH);
                if (su >= uvX + uvW) su = uvX + uvW - 1;
                if (sv >= uvY + uvH) sv = uvY + uvH - 1;
                if (su < 0 || su >= tw || sv < 0 || sv >= th) return;
                var ti = (sv * tw + su) * 4;
                var ca = td[ti + 3];
                if (ca === 0) return;
                zBuf[zIdx] = pz;
                setPixel(px, py, td[ti], td[ti + 1], td[ti + 2], ca, shade);
            });
        }

        function drawBBFace(tex, vA, vB, vC, vD, uvA, uvB, uvC, uvD) {
            if (!tex) return;
            var PA = project(vA), PB = project(vB), PC = project(vC), PD = project(vD);
            function rasterTri(P0, P1, P2, uv0, uv1, uv2) {
                var ax = P0[0], ay = P0[1], az = P0[2];
                var bx = P1[0], by = P1[1], bz = P1[2];
                var cx_ = P2[0], cy_ = P2[1], cz = P2[2];
                var iwA = 1 / (cameraDist + az), iwB = 1 / (cameraDist + bz), iwC = 1 / (cameraDist + cz);
                var uwA = uv0[0] * iwA, vwA = uv0[1] * iwA;
                var uwB = uv1[0] * iwB, vwB = uv1[1] * iwB;
                var uwC = uv2[0] * iwC, vwC = uv2[1] * iwC;
                var ex1 = bx - ax, ey1 = by - ay;
                var ex2 = cx_ - ax, ey2 = cy_ - ay;
                var denom = ex1 * ey2 - ex2 * ey1;
                if (denom === 0) return;
                var invDen = 1 / denom;
                var minXp = Math.max(0, Math.floor(Math.min(ax, bx, cx_)));
                var maxXp = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx_)));
                var minYp = Math.max(0, Math.floor(Math.min(ay, by, cy_)));
                var maxYp = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy_)));
                if (minXp > maxXp || minYp > maxYp) return;
                var td = tex.data, tw = tex.width, th = tex.height;
                var fh = tex.frameH || th;
                var frameOff = tex.curFrameOff || 0;
                var smooth = !!tex.smooth;
                for (var py = minYp; py <= maxYp; py++) {
                    var fy = py + 0.5;
                    for (var px = minXp; px <= maxXp; px++) {
                        var fx = px + 0.5;
                        var dx = fx - ax, dy = fy - ay;
                        var beta = (dx * ey2 - dy * ex2) * invDen;
                        var gamma = (dy * ex1 - dx * ey1) * invDen;
                        if (beta < 0 || gamma < 0 || beta + gamma > 1) continue;
                        var alpha = 1 - beta - gamma;
                        var iw = alpha * iwA + beta * iwB + gamma * iwC;
                        var pz = 1 / iw - cameraDist;
                        var zIdx = py * w + px;
                        if (pz >= zBuf[zIdx]) continue;
                        var u = (alpha * uwA + beta * uwB + gamma * uwC) / iw;
                        var v = (alpha * vwA + beta * vwB + gamma * vwC) / iw;
                        if (u < 0) u = 0; else if (u > 1) u = 0.99999;
                        if (v < 0) v = 0; else if (v > 1) v = 0.99999;
                        if (smooth) {
                            var gu = u * tw - 0.5, gv = v * fh - 0.5;
                            var gx0 = Math.floor(gu), gy0 = Math.floor(gv);
                            var wx = gu - gx0, wy = gv - gy0;
                            var gx1 = gx0 + 1, gy1 = gy0 + 1;
                            if (gx0 < 0) gx0 = 0; else if (gx0 > tw - 1) gx0 = tw - 1;
                            if (gx1 < 0) gx1 = 0; else if (gx1 > tw - 1) gx1 = tw - 1;
                            if (gy0 < 0) gy0 = 0; else if (gy0 > fh - 1) gy0 = fh - 1;
                            if (gy1 < 0) gy1 = 0; else if (gy1 > fh - 1) gy1 = fh - 1;
                            var rw0 = (gy0 + frameOff) * tw, rw1 = (gy1 + frameOff) * tw;
                            var i00 = (rw0 + gx0) * 4, i10 = (rw0 + gx1) * 4;
                            var i01 = (rw1 + gx0) * 4, i11 = (rw1 + gx1) * 4;
                            var a00 = td[i00 + 3] * (1 - wx) * (1 - wy);
                            var a10 = td[i10 + 3] * wx * (1 - wy);
                            var a01 = td[i01 + 3] * (1 - wx) * wy;
                            var a11 = td[i11 + 3] * wx * wy;
                            var aSum = a00 + a10 + a01 + a11;
                            if (aSum < 2) continue;
                            zBuf[zIdx] = pz;
                            setPixel(px, py,
                                (td[i00] * a00 + td[i10] * a10 + td[i01] * a01 + td[i11] * a11) / aSum,
                                (td[i00 + 1] * a00 + td[i10 + 1] * a10 + td[i01 + 1] * a01 + td[i11 + 1] * a11) / aSum,
                                (td[i00 + 2] * a00 + td[i10 + 2] * a10 + td[i01 + 2] * a01 + td[i11 + 2] * a11) / aSum,
                                aSum, 1.0);
                            continue;
                        }
                        var su = (u * tw) | 0;
                        var sv = (v * fh) | 0;
                        if (su >= tw) su = tw - 1;
                        if (sv >= fh) sv = fh - 1;
                        sv += frameOff;
                        if (su < 0 || su >= tw || sv < 0 || sv >= th) continue;
                        var ti = (sv * tw + su) * 4;
                        var ca = td[ti + 3];
                        if (ca === 0) continue;
                        zBuf[zIdx] = pz;
                        setPixel(px, py, td[ti], td[ti + 1], td[ti + 2], ca, 1.0);
                    }
                }
            }
            rasterTri(PA, PB, PC, uvA, uvB, uvC);
            rasterTri(PA, PC, PD, uvA, uvC, uvD);
        }

        function drawSolidFace(tl, tr, br, bl, r, g, b, shade, cull) {
            var P0 = project(tl), P1 = project(tr), P2 = project(br), P3 = project(bl);
            rasterQuad(P0, P1, P2, P3, !!cull, function (px, py, pz, zIdx) {
                zBuf[zIdx] = pz;
                setPixel(px, py, r, g, b, 255, shade);
            });
        }

        function drawBoneBox(from, to, thickness, r, g, b) {
            var dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
            var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 0.01) return;
            dx /= len; dy /= len; dz /= len;
            var p1x = dy, p1y = -dx, p1z = 0;
            var p1len = Math.sqrt(p1x * p1x + p1y * p1y + p1z * p1z);
            if (p1len < 0.01) { p1x = 1; p1y = 0; p1z = 0; p1len = 1; }
            p1x /= p1len; p1y /= p1len; p1z /= p1len;
            var p2x = dy * p1z - dz * p1y;
            var p2y = dz * p1x - dx * p1z;
            var p2z = dx * p1y - dy * p1x;
            var ht = thickness * 0.5;
            function mk(base, s1, s2) {
                return [base[0] + s1 * p1x + s2 * p2x, base[1] + s1 * p1y + s2 * p2y, base[2] + s1 * p1z + s2 * p2z];
            }
            var f0 = mk(from, -ht, -ht), f1 = mk(from, ht, -ht), f2 = mk(from, ht, ht), f3 = mk(from, -ht, ht);
            var t0 = mk(to, -ht, -ht), t1 = mk(to, ht, -ht), t2 = mk(to, ht, ht), t3 = mk(to, -ht, ht);
            drawSolidFace(f0, f1, t1, t0, r, g, b, 0.70, false);
            drawSolidFace(f1, f2, t2, t1, r, g, b, 0.85, false);
            drawSolidFace(f2, f3, t3, t2, r, g, b, 0.70, false);
            drawSolidFace(f3, f0, t0, t3, r, g, b, 0.55, false);
            drawSolidFace(f0, f1, f2, f3, r, g, b, 0.60, false);
            drawSolidFace(t1, t0, t3, t2, r, g, b, 0.60, false);
        }

        function drawBox(tex, ox, oy, oz, sx, sy, sz, uvX, uvY, uvW, uvH, uvD, skipFaces, mirror) {
            skipFaces = skipFaces || 0;
            var x0 = ox, x1 = ox + sx, y0 = oy, y1 = oy + sy, z0 = oz, z1 = oz + sz;

            var uLeft, uRight;
            if (mirror) {
                uLeft = uvX + uvD + uvW;
                uRight = uvX + uvD;
            } else {
                uLeft = uvX + uvD;
                uRight = uvX + uvD + uvW;
            }
            var uFront = mirror ? -uvW : uvW;
            var uSide = mirror ? -uvD : uvD;

            if (!(skipFaces & 4))
                drawTexFace(tex, [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1],
                    uLeft, uvY + uvD, uFront, uvH, 1.0, true);
            if (!(skipFaces & 8))
                drawTexFace(tex, [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0],
                    mirror ? uvX : uvX + uvD + uvW + uvD, uvY + uvD, uFront, uvH, 0.55, true);
            if (!(skipFaces & 16))
                drawTexFace(tex, [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0],
                    mirror ? uvX + uvD + uvW : uvX, uvY + uvD, uSide, uvH, 0.7, true);
            if (!(skipFaces & 32))
                drawTexFace(tex, [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1],
                    mirror ? uvX + uvD : uvX + uvD + uvW, uvY + uvD, uSide, uvH, 0.7, true);
            if (!(skipFaces & 1))
                drawTexFace(tex, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0],
                    uLeft, uvY, uFront, uvD, 0.85, true);
            if (!(skipFaces & 2))
                drawTexFace(tex, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                    uLeft + uFront, uvY, uFront, uvD, 0.5, true);
        }

        var classic = skin.height < 64;
        var slim = !classic && (typeof opt.slim === 'boolean' ? opt.slim : !hasWideArms(skin));
        var armW = slim ? 3 : 4;

        var lLegPiv = [-2, -12, 0], rLegPiv = [2, -12, 0];
        var lArmPiv = [-4 - armW/2, 0, 0], rArmPiv = [4 + armW/2, 0, 0];
        var headPiv = [0, 0, 0];

        var bodyKey = skinTag(skin) + '|' + w + '|' + h + '|' + rotationY + '|' + rotationX + '|' + zoom + '|' +
            cameraDist + '|' + headYaw + '|' + leftArmPitch + '|' + rightArmPitch + '|' + leftLegPitch + '|' + rightLegPitch + '|' + hideHeadLayer;
        var cachedBody = null;
        for (var bi = 0; bi < bodyCache.length; bi++) if (bodyCache[bi].key === bodyKey) { cachedBody = bodyCache[bi]; break; }
        if (cachedBody) {
            buf.set(cachedBody.buf);
            zBuf.set(cachedBody.zBuf);
        } else {
        drawBoxPosed(skin, -4, -24, -2, 4, 12, 4, 0, 16, 4, 12, 4, 0, false, lLegPiv[0], lLegPiv[1], lLegPiv[2], leftLegPitch, 0);
        if (classic) {
            drawBoxPosed(skin, 0, -24, -2, 4, 12, 4, 0, 16, 4, 12, 4, 0, true, rLegPiv[0], rLegPiv[1], rLegPiv[2], rightLegPitch, 0);
        } else {
            drawBoxPosed(skin, 0, -24, -2, 4, 12, 4, 16, 48, 4, 12, 4, 0, false, rLegPiv[0], rLegPiv[1], rLegPiv[2], rightLegPitch, 0);
        }
        drawBox(skin, -4, -12, -2, 8, 12, 4, 16, 16, 8, 12, 4, 16 | 32);
        drawBoxPosed(skin, -4 - armW, -12, -2, armW, 12, 4, 40, 16, armW, 12, 4, 0, false, lArmPiv[0], lArmPiv[1], lArmPiv[2], leftArmPitch, 0);
        if (classic) {
            drawBoxPosed(skin, 4, -12, -2, armW, 12, 4, 40, 16, armW, 12, 4, 0, true, rArmPiv[0], rArmPiv[1], rArmPiv[2], rightArmPitch, 0);
        } else {
            drawBoxPosed(skin, 4, -12, -2, armW, 12, 4, 32, 48, armW, 12, 4, 0, false, rArmPiv[0], rArmPiv[1], rArmPiv[2], rightArmPitch, 0);
        }
        drawBoxPosed(skin, -4, 0, -4, 8, 8, 8, 0, 0, 8, 8, 8, 0, false, headPiv[0], headPiv[1], headPiv[2], headYaw, 1);

        if (!hideHeadLayer) {
            var inf = 0.5;
            drawBoxPosed(skin, -4 - inf, -inf, -4 - inf, 8 + 2 * inf, 8 + 2 * inf, 8 + 2 * inf, 32, 0, 8, 8, 8, 0, false, headPiv[0], headPiv[1], headPiv[2], headYaw, 1);
        }

        if (!classic) {
            var lay = 0.25;
            drawBoxPosed(skin, -4 - lay, -24 - lay, -2 - lay, 4 + 2 * lay, 12 + 2 * lay, 4 + 2 * lay, 0, 32, 4, 12, 4, 0, false, lLegPiv[0], lLegPiv[1], lLegPiv[2], leftLegPitch, 0);
            drawBoxPosed(skin, -lay, -24 - lay, -2 - lay, 4 + 2 * lay, 12 + 2 * lay, 4 + 2 * lay, 0, 48, 4, 12, 4, 0, false, rLegPiv[0], rLegPiv[1], rLegPiv[2], rightLegPitch, 0);
            drawBox(skin, -4 - lay, -12 - lay, -2 - lay, 8 + 2 * lay, 12 + 2 * lay, 4 + 2 * lay, 16, 32, 8, 12, 4, 16 | 32);
            drawBoxPosed(skin, -4 - armW - lay, -12 - lay, -2 - lay, armW + 2 * lay, 12 + 2 * lay, 4 + 2 * lay, 40, 32, armW, 12, 4, 0, false, lArmPiv[0], lArmPiv[1], lArmPiv[2], leftArmPitch, 0);
            drawBoxPosed(skin, 4 - lay, -12 - lay, -2 - lay, armW + 2 * lay, 12 + 2 * lay, 4 + 2 * lay, 48, 48, armW, 12, 4, 0, false, rArmPiv[0], rArmPiv[1], rArmPiv[2], rightArmPitch, 0);
        }
            var mi = bodyMisses.indexOf(bodyKey);
            if (mi !== -1) {
                bodyMisses.splice(mi, 1);
                if (bodyCache.length >= 8) bodyCache.shift();
                bodyCache.push({ key: bodyKey, buf: new Uint8ClampedArray(buf), zBuf: new Float32Array(zBuf) });
            } else {
                if (bodyMisses.length >= 12) bodyMisses.shift();
                bodyMisses.push(bodyKey);
            }
        }

        if (wings) {
            var wingTexW = wings.width, wingTexH = wings.height;
            var wingHalf = wingTexW / 2;
            var boneR = 45, boneG = 8, boneB = 8;

            function renderWing(s) {
                var t = wingFlapPhase;
                var wristWave = Math.sin(t) * 1.8;
                var tipWave = Math.sin(t - 0.6) * 3.5;
                var tipBendZ = Math.cos(t - 0.4) * 2.5;

                var back = [s * 1.5, -1.0, -2.5];
                var wrist = [s * 9.0, 2.5 + wristWave, -4.5];
                var f1 = [s * 17.0, 9.0 + tipWave, -2.0 + tipBendZ];
                var f2 = [s * 20.0, 3.0 + tipWave, -3.0 + tipBendZ];
                var f3 = [s * 18.0, -4.0 + tipWave * 0.7, -4.0 + tipBendZ * 0.6];
                var f4 = [s * 13.0, -10.5 + tipWave * 0.4, -4.5 + tipBendZ * 0.3];
                var waist = [s * 3.0, -8.5, -2.5];
                drawTexFace(wings, wrist, f1, f2, wrist, 0, 0, wingHalf, wingTexH, 0.95, false);
                drawTexFace(wings, wrist, f2, f3, wrist, 0, 0, wingHalf, wingTexH, 0.88, false);
                drawTexFace(wings, wrist, f3, f4, wrist, 0, 0, wingHalf, wingTexH, 0.80, false);
                drawTexFace(wings, back, wrist, f4, waist, 0, 0, wingHalf, wingTexH, 0.72, false);
                drawBoneBox(back, wrist, 1.8, boneR, boneG, boneB);
                drawBoneBox(wrist, f1, 1.2, boneR, boneG, boneB);
                drawBoneBox(wrist, f2, 1.2, boneR, boneG, boneB);
                drawBoneBox(wrist, f3, 1.2, boneR, boneG, boneB);
                drawBoneBox(wrist, f4, 1.2, boneR, boneG, boneB);
            }
            renderWing(1);
            renderWing(-1);
        }

        if (hat) {
            if (!isHorns) {
                var hatInf = 0.8;
                drawBox(hat, -4 - hatInf, 5, -4 - hatInf, 8 + 2 * hatInf, 3 + hatInf, 8 + 2 * hatInf, 0, 0, 8, 8, 8);
            } else {
                var hBaseR = 35, hBaseG = 30, hBaseB = 35;
                var hMidR = 50, hMidG = 40, hMidB = 45;
                var hTipR = 90, hTipG = 30, hTipB = 25;
                if (hat.width >= 8 && hat.height >= 8) {
                    var cBase = getPixel(hat, 4, 28);
                    if (cBase) { hBaseR = cBase[0]; hBaseG = cBase[1]; hBaseB = cBase[2]; }
                    var cMid = getPixel(hat, 4, 16);
                    if (cMid) { hMidR = cMid[0]; hMidG = cMid[1]; hMidB = cMid[2]; }
                    var cTip = getPixel(hat, 4, 4);
                    if (cTip) { hTipR = cTip[0]; hTipG = cTip[1]; hTipB = cTip[2]; }
                }
                function renderHorn(s) {
                    var p0 = [s * 3.0, 7.5, -0.5];
                    var p1 = [s * 4.5, 10.0, -1.0];
                    var p2 = [s * 5.5, 13.0, -0.5];
                    var p3 = [s * 5.0, 15.5, 0.5];
                    var p4 = [s * 4.0, 17.5, 1.0];
                    drawBoneBox(p0, p1, 2.2, hBaseR, hBaseG, hBaseB);
                    drawBoneBox(p1, p2, 1.8, hBaseR, hBaseG, hBaseB);
                    drawBoneBox(p2, p3, 1.3, hMidR, hMidG, hMidB);
                    drawBoneBox(p3, p4, 0.8, hTipR, hTipG, hTipB);
                }
                renderHorn(1);
                renderHorn(-1);
            }
        }

        if (cape) {
            var halfW = cape.width / 2;
            var texH = cape.height;
            var uv1 = (texH * 4 / 16) | 0;
            var uv2 = (texH * 6 / 16) | 0;
            var uv3 = texH - uv1 - uv2;
            var uv12 = uv1 + uv2;
            var s1 = capeSwingX * 0.10;
            var s2 = capeSwingX * 0.52;
            var s3 = capeSwingX;
            var liftY = Math.abs(capeSwingX) * 0.38;
            var bb1 = Math.abs(capeSwingX) * 0.10;
            var bb2 = Math.abs(capeSwingX) * 0.22;

            drawTexFace(cape,
                [-5, 0, -2.5], [5, 0, -2.5], [5 + s1, -4, -2.5], [-5 + s1, -4, -2.5],
                0, 0, halfW, uv1, 0.85, false);
            drawTexFace(cape,
                [-5 + s1, -4, -2.5], [5 + s1, -4, -2.5], [5 + s2, -10, -2.5 - bb1], [-5 + s2, -10, -2.5 - bb1],
                0, uv1, halfW, uv2, 0.85, false);
            drawTexFace(cape,
                [-5 + s2, -10, -2.5 - bb1], [5 + s2, -10, -2.5 - bb1], [5 + s3, -16 + liftY, -2.5 - bb2], [-5 + s3, -16 + liftY, -2.5 - bb2],
                0, uv12, halfW, uv3, 0.85, false);
            drawTexFace(cape,
                [5, 0, -3.5], [-5, 0, -3.5], [-5 + s1, -4, -3.5], [5 + s1, -4, -3.5],
                halfW, 0, halfW, uv1, 0.30, false);
            drawTexFace(cape,
                [5 + s1, -4, -3.5], [-5 + s1, -4, -3.5], [-5 + s2, -10, -3.5 - bb1], [5 + s2, -10, -3.5 - bb1],
                halfW, uv1, halfW, uv2, 0.30, false);
            drawTexFace(cape,
                [5 + s2, -10, -3.5 - bb1], [-5 + s2, -10, -3.5 - bb1], [-5 + s3, -16 + liftY, -3.5 - bb2], [5 + s3, -16 + liftY, -3.5 - bb2],
                halfW, uv12, halfW, uv3, 0.30, false);

            var sideStripW = Math.max(1, (halfW / 12) | 0);
            var rightStripX = halfW - sideStripW;
            var leftStripX = 0;
            var topStripH = Math.max(1, (texH / 16) | 0);
            var bottomStripH = Math.max(1, (texH / 16) | 0);
            var topBottomStripW = halfW;

            drawTexFace(cape,
                [5, 0, -2.5], [5, 0, -3.5], [5 + s1, -4, -3.5], [5 + s1, -4, -2.5],
                rightStripX, 0, sideStripW, uv1, 0.70, false);
            drawTexFace(cape,
                [5 + s1, -4, -2.5], [5 + s1, -4, -3.5], [5 + s2, -10, -3.5 - bb1], [5 + s2, -10, -2.5 - bb1],
                rightStripX, uv1, sideStripW, uv2, 0.70, false);
            drawTexFace(cape,
                [5 + s2, -10, -2.5 - bb1], [5 + s2, -10, -3.5 - bb1], [5 + s3, -16 + liftY, -3.5 - bb2], [5 + s3, -16 + liftY, -2.5 - bb2],
                rightStripX, uv12, sideStripW, uv3, 0.70, false);

            drawTexFace(cape,
                [-5, 0, -3.5], [-5, 0, -2.5], [-5 + s1, -4, -2.5], [-5 + s1, -4, -3.5],
                leftStripX, 0, sideStripW, uv1, 0.70, false);
            drawTexFace(cape,
                [-5 + s1, -4, -3.5], [-5 + s1, -4, -2.5], [-5 + s2, -10, -2.5 - bb1], [-5 + s2, -10, -3.5 - bb1],
                leftStripX, uv1, sideStripW, uv2, 0.70, false);
            drawTexFace(cape,
                [-5 + s2, -10, -3.5 - bb1], [-5 + s2, -10, -2.5 - bb1], [-5 + s3, -16 + liftY, -2.5 - bb2], [-5 + s3, -16 + liftY, -3.5 - bb2],
                leftStripX, uv12, sideStripW, uv3, 0.70, false);

            drawTexFace(cape,
                [-5, 0, -2.5], [5, 0, -2.5], [5, 0, -3.5], [-5, 0, -3.5],
                0, 0, topBottomStripW, topStripH, 0.80, false);
            drawTexFace(cape,
                [-5 + s3, -16 + liftY, -3.5 - bb2], [5 + s3, -16 + liftY, -3.5 - bb2], [5 + s3, -16 + liftY, -2.5 - bb2], [-5 + s3, -16 + liftY, -2.5 - bb2],
                0, texH - bottomStripH, topBottomStripW, bottomStripH, 0.55, false);
        }

        if (auraType) {
            var at = auraPhase;
            if (auraType === 'darkness') {
                var strandCount = 5, segsPerStrand = 16, tubeSides = 6;
                var baseR = 17.0, arcSpan = Math.PI * 0.55;
                var ttD = at;

                var csCos = new Float32Array(tubeSides);
                var csSin = new Float32Array(tubeSides);
                for (var kk = 0; kk < tubeSides; kk++) {
                    var aa = Math.PI * 2 * kk / tubeSides;
                    csCos[kk] = Math.cos(aa);
                    csSin[kk] = Math.sin(aa);
                }

                for (var sIdx = 0; sIdx < strandCount; sIdx++) {
                    var driftSpeed = 0.18 + (sIdx % 3) * 0.05;
                    var anchor = sIdx * (Math.PI * 2 / strandCount) + ttD * driftSpeed;
                    var yCenter = Math.sin(ttD * 0.45 + sIdx * 1.13) * 6.0 - 5.0;
                    var yArch   = 5.0 + Math.sin(ttD * 0.62 + sIdx * 0.71) * 2.0;

                    var spikeMag = strandSpike(ttD, sIdx);
                    var spikeU   = 0.45 + 0.35 * Math.sin(ttD * 0.85 + sIdx * 1.73);

                    var centersD = new Array(segsPerStrand);
                    var radiiD   = new Float32Array(segsPerStrand);
                    var sBoosts  = new Float32Array(segsPerStrand);

                    for (var ii = 0; ii < segsPerStrand; ii++) {
                        var u = ii / (segsPerStrand - 1);
                        var theta = anchor + (u - 0.5) * arcSpan;

                        var radWobble =
                              Math.sin(u * 8.0 + ttD * 1.40 + sIdx * 1.5) * 0.9
                            + Math.sin(u * 4.0 + ttD * 0.90 + sIdx * 0.7) * 0.6;
                        var r = baseR + radWobble;

                        var spikeDist = u - spikeU;
                        var spikeFalloff = Math.exp(-spikeDist * spikeDist * 24.0);
                        var spikeBoost = spikeMag * spikeFalloff;
                        sBoosts[ii] = spikeBoost;
                        r += spikeBoost * 11.0;

                        var ccx = r * Math.cos(theta);
                        var ccz = r * Math.sin(theta);
                        var yWobble =
                              Math.sin(u * 5.5  + ttD * 1.50 + sIdx) * 1.7
                            + Math.sin(u * 11.0 + ttD * 2.20 + sIdx * 0.5) * 0.8;
                        var ccy = yCenter + yArch * Math.sin(u * Math.PI) + yWobble;
                        centersD[ii] = [ccx, ccy, ccz];

                        var taper = Math.sin(u * Math.PI);
                        var widthBreath = 0.85 + 0.25 * Math.sin(u * 7.0 + ttD * 2.50 + sIdx);
                        radiiD[ii] = (0.55 + taper * 0.85) * widthBreath + spikeBoost * 0.8;
                    }

                    var e1s = new Array(segsPerStrand);
                    var e2s = new Array(segsPerStrand);
                    for (var iE = 0; iE < segsPerStrand; iE++) {
                        var tx, ty, tz;
                        if (iE === 0) {
                            tx = centersD[1][0] - centersD[0][0];
                            ty = centersD[1][1] - centersD[0][1];
                            tz = centersD[1][2] - centersD[0][2];
                        } else if (iE === segsPerStrand - 1) {
                            tx = centersD[iE][0] - centersD[iE - 1][0];
                            ty = centersD[iE][1] - centersD[iE - 1][1];
                            tz = centersD[iE][2] - centersD[iE - 1][2];
                        } else {
                            tx = centersD[iE + 1][0] - centersD[iE - 1][0];
                            ty = centersD[iE + 1][1] - centersD[iE - 1][1];
                            tz = centersD[iE + 1][2] - centersD[iE - 1][2];
                        }
                        var tlsq = tx * tx + ty * ty + tz * tz;
                        if (tlsq < 0.00001) { tx = 1; ty = 0; tz = 0; }
                        else { var tl = Math.sqrt(tlsq); tx /= tl; ty /= tl; tz /= tl; }

                        var e1x, e1y, e1z;
                        if (Math.abs(ty) < 0.9) { e1x = 1 * tz - 0 * ty; e1y = 0 * tx - 0 * tz; e1z = 0 * ty - 1 * tx; }
                        else { e1x = 0 * tz - 0 * ty; e1y = 0 * tx - 1 * tz; e1z = 1 * ty - 0 * tx; }
                        var elsq = e1x * e1x + e1y * e1y + e1z * e1z;
                        if (elsq < 0.00001) { e1x = 1; e1y = 0; e1z = 0; }
                        else { var el = Math.sqrt(elsq); e1x /= el; e1y /= el; e1z /= el; }

                        var e2x = ty * e1z - tz * e1y;
                        var e2y = tz * e1x - tx * e1z;
                        var e2z = tx * e1y - ty * e1x;
                        var e2sq = e2x * e2x + e2y * e2y + e2z * e2z;
                        if (e2sq < 0.00001) { e2x = 0; e2y = 1; e2z = 0; }
                        else { var e2l = Math.sqrt(e2sq); e2x /= e2l; e2y /= e2l; e2z /= e2l; }

                        e1s[iE] = [e1x, e1y, e1z];
                        e2s[iE] = [e2x, e2y, e2z];
                    }

                    var csVerts = new Array(segsPerStrand);
                    for (var iV = 0; iV < segsPerStrand; iV++) {
                        csVerts[iV] = new Array(tubeSides);
                        var rr = radiiD[iV];
                        var cc = centersD[iV];
                        var e1 = e1s[iV];
                        var e2 = e2s[iV];
                        for (var kV = 0; kV < tubeSides; kV++) {
                            var aa2 = csCos[kV] * rr;
                            var bb2 = csSin[kV] * rr;
                            csVerts[iV][kV] = [
                                cc[0] + e1[0] * aa2 + e2[0] * bb2,
                                cc[1] + e1[1] * aa2 + e2[1] * bb2,
                                cc[2] + e1[2] * aa2 + e2[2] * bb2
                            ];
                        }
                    }

                    for (var iQ = 0; iQ < segsPerStrand - 1; iQ++) {
                        var boost = (sBoosts[iQ] + sBoosts[iQ + 1]) * 0.5;
                        var uMid = (iQ + 0.5) / (segsPerStrand - 1);
                        var bodyFactor = Math.sin(uMid * Math.PI);

                        var rCol = Math.max(0, Math.min(255, 0 + Math.round(bodyFactor * 4) + Math.round(boost * 28)));
                        var gCol = Math.max(0, Math.min(255, 0 + Math.round(bodyFactor * 1) + Math.round(boost * 4)));
                        var bCol = Math.max(0, Math.min(255, 6 + Math.round(bodyFactor * 12) + Math.round(boost * 55)));
                        var shadeF = 0.85 + bodyFactor * 0.10 + boost * 0.15;

                        for (var kQ = 0; kQ < tubeSides; kQ++) {
                            var kQ2 = (kQ + 1) % tubeSides;
                            drawSolidFace(
                                csVerts[iQ][kQ],
                                csVerts[iQ + 1][kQ],
                                csVerts[iQ + 1][kQ2],
                                csVerts[iQ][kQ2],
                                rCol, gCol, bCol, shadeF, false);
                        }
                    }
                }
            } else if (auraType === 'hearts') {
                var brokenHeart = [
                    [0, 1, 1, 0, 0, 2, 2, 0],
                    [1, 1, 1, 1, 2, 2, 2, 2],
                    [1, 1, 1, 1, 1, 2, 2, 2],
                    [0, 1, 1, 1, 2, 2, 2, 0],
                    [0, 0, 1, 1, 1, 2, 2, 0],
                    [0, 0, 0, 1, 2, 2, 0, 0],
                    [0, 0, 0, 1, 2, 0, 0, 0]
                ];
                var centerCol = 3.5;
                for (var hi = 0; hi < 6; hi++) {
                    var hAng = at * 0.8 + hi * (Math.PI * 2 / 6);
                    var hYoff = Math.sin(at * 0.55 + hi * 0.85) * 7;
                    var hRad = 9 + Math.sin(at * 0.4 + hi * 1.3) * 2.5;
                    var hcx = Math.cos(hAng) * hRad, hcz = Math.sin(hAng) * hRad, hcy = -1 + hYoff;
                    var pulse = 1 + Math.sin(at * 3 + hi * 1.2) * 0.12;
                    var pxSize = 0.42 * pulse;
                    var hr = 200 + (hi * 11) % 50;
                    var hg = 15 + (hi * 3) % 20;
                    var hb = 25 + (hi * 5) % 20;
                    var drk = (hr * 0.45) | 0, dkg = (hg * 0.3) | 0, dkb = (hb * 0.3) | 0;
                    var hshade = 0.85 + Math.sin(at * 1.8 + hi * 0.5) * 0.1;
                    for (var row = 0; row < 7; row++) {
                        for (var col = 0; col < 8; col++) {
                            var val = brokenHeart[row][col];
                            if (val === 0) continue;
                            var lx = (col - centerCol) * pxSize;
                            var ly = (3 - row) * pxSize;
                            var isCrack = false;
                            if (val === 1 && col + 1 < 8 && brokenHeart[row][col + 1] === 2) isCrack = true;
                            if (val === 2 && col - 1 >= 0 && brokenHeart[row][col - 1] === 1) isCrack = true;
                            var pr = isCrack ? drk : hr;
                            var pg = isCrack ? dkg : hg;
                            var pb = isCrack ? dkb : hb;
                            drawSolidFace(
                                [hcx + lx, hcy + ly + pxSize, hcz],
                                [hcx + lx + pxSize, hcy + ly + pxSize, hcz],
                                [hcx + lx + pxSize, hcy + ly, hcz],
                                [hcx + lx, hcy + ly, hcz],
                                pr, pg, pb, hshade, false);
                        }
                    }
                }
            } else if (auraType === 'flames') {
                var fireGrid = [
                    [0, 0, 0, 2, 0, 0, 0, 0],
                    [0, 0, 2, 2, 0, 0, 0, 0],
                    [0, 0, 2, 2, 2, 0, 0, 0],
                    [0, 2, 2, 2, 2, 0, 1, 0],
                    [0, 1, 2, 2, 1, 0, 1, 0],
                    [1, 1, 1, 2, 1, 1, 1, 0],
                    [1, 1, 1, 1, 1, 1, 1, 0],
                    [1, 3, 1, 1, 1, 3, 1, 0],
                    [0, 3, 3, 1, 3, 3, 0, 0],
                    [0, 0, 3, 3, 3, 0, 0, 0]
                ];
                for (var fi = 0; fi < 5; fi++) {
                    var fAng = at * 1.2 + fi * (Math.PI * 2 / 5);
                    var fRad = 9 + Math.sin(at * 0.5 + fi * 1.1) * 2;
                    var fxC = Math.cos(fAng) * fRad, fzC = Math.sin(fAng) * fRad;
                    var fyC = -4 + Math.sin(at * 0.7 + fi * 0.9) * 5;
                    var flicker = 1 + Math.sin(at * 4 + fi * 2.3) * 0.08;
                    var fpxSize = 0.4 * flicker;
                    for (var frow = 0; frow < 10; frow++) {
                        for (var fcol = 0; fcol < 8; fcol++) {
                            var fval = fireGrid[frow][fcol];
                            if (fval === 0) continue;
                            var flx = (fcol - 4) * fpxSize;
                            var fly = (5 - frow) * fpxSize;
                            var fcr, fcg, fcb, fsh;
                            if (fval === 2) { fcr = 255; fcg = 220; fcb = 50; fsh = 0.95; }
                            else if (fval === 3) { fcr = 200; fcg = 50; fcb = 10; fsh = 0.75; }
                            else { fcr = 255; fcg = 130; fcb = 20; fsh = 0.88; }
                            drawSolidFace(
                                [fxC + flx, fyC + fly + fpxSize, fzC],
                                [fxC + flx + fpxSize, fyC + fly + fpxSize, fzC],
                                [fxC + flx + fpxSize, fyC + fly, fzC],
                                [fxC + flx, fyC + fly, fzC],
                                fcr, fcg, fcb, fsh, false);
                        }
                    }
                }
                for (var e = 0; e < 12; e++) {
                    var life = (at * 1.6 + e * 0.52) % 2.5;
                    var frac = life / 2.5;
                    var seed = e * 137.5;
                    var startX = Math.sin(seed) * 3.5;
                    var startZ = Math.cos(seed) * 2;
                    var startY = -10 + (e % 5) * 4.5;
                    var ex = startX + Math.sin(at * 0.8 + e * 1.4) * frac * 3;
                    var ez = startZ + Math.cos(at * 0.6 + e * 1.7) * frac * 2;
                    var ey = startY + frac * 12;
                    var emberSize = (1 - frac) * 0.6 + 0.15;
                    var dim = 1 - frac * 0.7;
                    var er = 255;
                    var eg = (180 * dim) | 0;
                    var eb = (30 * dim) | 0;
                    drawSolidFace(
                        [ex - emberSize, ey - emberSize, ez],
                        [ex + emberSize, ey - emberSize, ez],
                        [ex + emberSize, ey + emberSize, ez],
                        [ex - emberSize, ey + emberSize, ez],
                        er, eg, eb, 0.8 * dim, false);
                }
            }
        }

        var bbmodels = opt.bbmodels || [opt];
        for (var bmi = 0; bmi < bbmodels.length; bmi++) {
            var item = bbmodels[bmi];
            if (!item.bbmodel || !item.bbmodelTextures || item.bbmodelTextures.length === 0) continue;
            drawBBModel(item.bbmodel, item.bbmodelTextures, item.bbmodelAttachment || 'head_top', bbmodelTime,
                +item.bbmodelOffsetX || 0, +item.bbmodelOffsetY || 0, +item.bbmodelOffsetZ || 0,
                +item.bbmodelRotationY || 0, +item.bbmodelScale || 1, !!item.bbmodelLegacy, !!item.bbmodelRest);
        }

        function bbAttachmentOffset(att) {
            switch (att) {
                case 'head_top':       return [0, 10, 0];
                case 'head_center':    return [0, 4, 0];
                case 'head_front':     return [0, 8.5, 0];
                case 'body_back':      return [12.1, -10.4, -1.0];
                case 'cape':           return [0, -16, -3.0];
                case 'back':           return [0, -8, -2.5];
                case 'feet_below':     return [0, -24, 0];
                case 'right_hand':     return [-6, -10, 0];
                case 'left_hand':      return [6, -10, 0];
                case 'shoulder_right': return [-5.6, -1.5, 0];
                case 'shoulder_left':  return [5.6, -1.5, 0];
                default:               return [0, 8.5, 0];
            }
        }

        function meshUvOf(face, key, resW, resH) {
            var uv = face.meshUv ? face.meshUv[key] : null;
            if (!uv) return [0, 0];
            return [uv[0] / resW, uv[1] / resH];
        }

        function matIdent() { return [1,0,0, 0,1,0, 0,0,1]; }
        function matMul(a, b) {
            return [
                a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
                a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
                a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
            ];
        }
        function matScaled(m, s) {
            if (!s || (s[0] === 1 && s[1] === 1 && s[2] === 1)) return m;
            return [
                m[0]*s[0], m[1]*s[1], m[2]*s[2],
                m[3]*s[0], m[4]*s[1], m[5]*s[2],
                m[6]*s[0], m[7]*s[1], m[8]*s[2]
            ];
        }
        function matRotXYZ(rxDeg, ryDeg, rzDeg) {
            var rx = rxDeg * Math.PI / 180, ry = ryDeg * Math.PI / 180, rz = rzDeg * Math.PI / 180;
            var cx = Math.cos(rx), sx = Math.sin(rx);
            var cy_ = Math.cos(ry), sy = Math.sin(ry);
            var cz = Math.cos(rz), sz = Math.sin(rz);
            var Rx = [1,0,0, 0,cx,-sx, 0,sx,cx];
            var Ry = [cy_,0,sy, 0,1,0, -sy,0,cy_];
            var Rz = [cz,-sz,0, sz,cz,0, 0,0,1];
            return matMul(matMul(Rz, Ry), Rx);
        }
        function transform(m, originX, originY, originZ, translateX, translateY, translateZ, p) {
            var lx = p[0] - originX, ly = p[1] - originY, lz = p[2] - originZ;
            var rx = m[0]*lx + m[1]*ly + m[2]*lz;
            var ry = m[3]*lx + m[4]*ly + m[5]*lz;
            var rz = m[6]*lx + m[7]*ly + m[8]*lz;
            return [rx + originX + translateX, ry + originY + translateY, rz + originZ + translateZ];
        }

        function drawBBModel(model, textures, attachment, time, perOffX, perOffY, perOffZ, perRotY, perScale, bbmodelLegacy, rest) {
            time += model.previewTime || 0;
            var bbmodelRest = rest && !bbmodelLegacy;
            var baseOff = bbAttachmentOffset(attachment);
            var off = [baseOff[0] + (perOffX||0), baseOff[1] + (perOffY||0), baseOff[2] + (perOffZ||0)];
            var anim = (!bbmodelRest && model.animations && model.animations.length > 0) ? model.animations[0] : null;
            for (var txi = 0; txi < textures.length; txi++) {
                var tx = textures[txi];
                if (!tx || !tx.frameCount || tx.frameCount <= 1) continue;
                var fi = bbmodelRest ? 0 : Math.floor(time * 20 / (tx.frameTime || 1)) % tx.frameCount;
                tx.curFrameOff = fi * tx.frameH;
            }
            var animTime = anim && anim.length > 0 ? (time % anim.length) : time;
            var isBodyBack = attachment === 'body_back';
            var isCapeAttach = attachment === 'cape';
            var sweepDeg = isBodyBack ? 195 : 0;
            var pivotPx = 7.4, pivotPy = 5, pivotPz = -3.06;
            var sweepCos = Math.cos(sweepDeg * Math.PI / 180);
            var sweepSin = Math.sin(sweepDeg * Math.PI / 180);
            var pScale = (perScale && perScale > 0) ? perScale : 1;
            var passSx = pScale, passSy = pScale, passSz = pScale;
            var passOffX = off[0], passOffY = off[1], passOffZ = off[2];
            var perRotRad = (perRotY || 0) * Math.PI / 180;
            var perCos = Math.cos(perRotRad), perSin = Math.sin(perRotRad);
            var hasPerRot = (perRotY || 0) !== 0;

            function evalBoneTransform(uuid, baseRot) {
                if (!anim || !anim.animators[uuid]) return { rot: baseRot.slice(), pos: [0,0,0], scale: [1,1,1] };
                var animator = anim.animators[uuid];
                var rot = window.LeafBBModel.evalKeyframeChannel(animator, 'rotation', animTime, [0,0,0], anim);
                var pos = window.LeafBBModel.evalKeyframeChannel(animator, 'position', animTime, [0,0,0], anim);
                var scl = window.LeafBBModel.evalKeyframeChannel(animator, 'scale', animTime, [1,1,1], anim);
                return { rot: [baseRot[0] + rot[0], baseRot[1] + rot[1], baseRot[2] + rot[2]], pos: pos, scale: scl };
            }

            function drawElement(e, chainMat, chainTx, chainTy, chainTz) {
                var isMesh = typeof e.type === 'string' && e.type.toLowerCase() === 'mesh';
                var fromX = e.from[0], fromY = e.from[1], fromZ = e.from[2];
                var toX = e.to[0], toY = e.to[1], toZ = e.to[2];
                if (!isMesh) {
                    if (toX < fromX || toY < fromY || toZ < fromZ) return;
                    if (toX === fromX && toY === fromY && toZ === fromZ) return;
                }
                var inf = e.inflate || 0;
                fromX -= inf; fromY -= inf; fromZ -= inf;
                toX += inf; toY += inf; toZ += inf;

                var localMat = matRotXYZ(e.rotation[0], e.rotation[1], e.rotation[2]);

                function tv(p) {
                    var ePivot = [e.origin[0], e.origin[1], e.origin[2]];
                    var local = [p[0] - ePivot[0], p[1] - ePivot[1], p[2] - ePivot[2]];
                    var afterLocal = [
                        localMat[0]*local[0] + localMat[1]*local[1] + localMat[2]*local[2] + ePivot[0],
                        localMat[3]*local[0] + localMat[4]*local[1] + localMat[5]*local[2] + ePivot[1],
                        localMat[6]*local[0] + localMat[7]*local[1] + localMat[8]*local[2] + ePivot[2]
                    ];
                    var x = chainMat[0]*afterLocal[0] + chainMat[1]*afterLocal[1] + chainMat[2]*afterLocal[2] + chainTx;
                    var y = chainMat[3]*afterLocal[0] + chainMat[4]*afterLocal[1] + chainMat[5]*afterLocal[2] + chainTy;
                    var z = chainMat[6]*afterLocal[0] + chainMat[7]*afterLocal[1] + chainMat[8]*afterLocal[2] + chainTz;
                    if (sweepDeg !== 0) {
                        var dxs = x - pivotPx, dzs = z - pivotPz;
                        x = dxs * sweepCos + dzs * sweepSin + pivotPx;
                        z = -dxs * sweepSin + dzs * sweepCos + pivotPz;
                    }
                    x *= passSx; y *= passSy; z *= passSz;
                    if (hasPerRot) {
                        var rxx = x * perCos + z * perSin;
                        var rzz = -x * perSin + z * perCos;
                        x = rxx; z = rzz;
                    }
                    var fx = x + passOffX, fy = y + passOffY, fz = z + passOffZ;
                    if (isCapeAttach && capeSwingX) {
                        var swingF = Math.min(1, Math.max(0, -fy / 16));
                        fx += capeSwingX * swingF;
                        fz -= Math.abs(capeSwingX) * 0.2 * swingF;
                    }
                    return [fx, fy, fz];
                }

                var x1c = fromX, y1c = fromY, z1c = fromZ;
                var x2c = toX,   y2c = toY,   z2c = toZ;
                var resW = (model.resolution && model.resolution.width)  ? model.resolution.width  : 16;
                var resH = (model.resolution && model.resolution.height) ? model.resolution.height : 16;

                if (isMesh) {
                    if (!e.vertices) return;
                    var meshKeys = Object.keys(e.faces);
                    for (var mi = 0; mi < meshKeys.length; mi++) {
                        var mf = e.faces[meshKeys[mi]];
                        if (!mf || !mf.meshVertices || mf.meshVertices.length < 3) continue;
                        var mTex = textures[mf.textureIndex || 0];
                        if (!mTex) continue;
                        var mk = mf.meshVertices;
                        var p0 = e.vertices[mk[0]], p1 = e.vertices[mk[1]], p2 = e.vertices[mk[2]];
                        if (!p0 || !p1 || !p2) continue;
                        var k3 = mk.length >= 4 && e.vertices[mk[3]] ? mk[3] : mk[2];
                        var p3 = e.vertices[k3];
                        var mo = e.origin;
                        drawBBFace(mTex,
                            tv([p0[0] + mo[0], p0[1] + mo[1], p0[2] + mo[2]]),
                            tv([p1[0] + mo[0], p1[1] + mo[1], p1[2] + mo[2]]),
                            tv([p2[0] + mo[0], p2[1] + mo[1], p2[2] + mo[2]]),
                            tv([p3[0] + mo[0], p3[1] + mo[1], p3[2] + mo[2]]),
                            meshUvOf(mf, mk[0], resW, resH), meshUvOf(mf, mk[1], resW, resH),
                            meshUvOf(mf, mk[2], resW, resH), meshUvOf(mf, k3, resW, resH));
                    }
                    return;
                }

                var xW = x1c, xE = x2c, yD = y1c, yU = y2c, zN = z1c, zS = z2c;
                if (x1c === x2c) { xW -= FLAT_FACE_GAP; xE += FLAT_FACE_GAP; }
                if (y1c === y2c) { yD -= FLAT_FACE_GAP; yU += FLAT_FACE_GAP; }
                if (z1c === z2c) { zN -= FLAT_FACE_GAP; zS += FLAT_FACE_GAP; }

                var faceList = ['north','south','east','west','up','down'];
                for (var fi = 0; fi < faceList.length; fi++) {
                    var key = faceList[fi];
                    var f = e.faces[key];
                    if (!f || !f.uv) continue;
                    var tex = textures[f.textureIndex || 0];
                    if (!tex) continue;

                    var u1n = f.uv[0] / resW, v1n = f.uv[1] / resH;
                    var u2n = f.uv[2] / resW, v2n = f.uv[3] / resH;
                    var uvA = [u1n, v2n], uvB = [u2n, v2n], uvC = [u2n, v1n], uvD = [u1n, v1n];

                    var ax, ay, az, bx, by, bz, cx_, cy_, cz_, dx_, dy_, dz_;
                    if (key === 'north') {
                        ax = x2c; ay = y1c; az = zN;
                        bx = x1c; by = y1c; bz = zN;
                        cx_ = x1c; cy_ = y2c; cz_ = zN;
                        dx_ = x2c; dy_ = y2c; dz_ = zN;
                    } else if (key === 'south') {
                        ax = x1c; ay = y1c; az = zS;
                        bx = x2c; by = y1c; bz = zS;
                        cx_ = x2c; cy_ = y2c; cz_ = zS;
                        dx_ = x1c; dy_ = y2c; dz_ = zS;
                    } else if (key === 'east') {
                        ax = xE; ay = y1c; az = z2c;
                        bx = xE; by = y1c; bz = z1c;
                        cx_ = xE; cy_ = y2c; cz_ = z1c;
                        dx_ = xE; dy_ = y2c; dz_ = z2c;
                    } else if (key === 'west') {
                        ax = xW; ay = y1c; az = z1c;
                        bx = xW; by = y1c; bz = z2c;
                        cx_ = xW; cy_ = y2c; cz_ = z2c;
                        dx_ = xW; dy_ = y2c; dz_ = z1c;
                    } else if (key === 'up') {
                        ax = x1c; ay = yU; az = z2c;
                        bx = x2c; by = yU; bz = z2c;
                        cx_ = x2c; cy_ = yU; cz_ = z1c;
                        dx_ = x1c; dy_ = yU; dz_ = z1c;
                    } else {
                        ax = x1c; ay = yD; az = z1c;
                        bx = x2c; by = yD; bz = z1c;
                        cx_ = x2c; cy_ = yD; cz_ = z2c;
                        dx_ = x1c; dy_ = yD; dz_ = z2c;
                    }

                    var vA = tv([ax, ay, az]);
                    var vB = tv([bx, by, bz]);
                    var vC = tv([cx_, cy_, cz_]);
                    var vD = tv([dx_, dy_, dz_]);
                    drawBBFace(tex, vA, vB, vC, vD, uvA, uvB, uvC, uvD);
                }
            }

            function drawNode(node, parentMat, parentTx, parentTy, parentTz, isRoot) {
                var bt = evalBoneTransform(node.uuid, node.rotation);
                var rootAnchor = isRoot && isBodyBack;
                var rotX = rootAnchor ? node.rotation[0] : bt.rot[0];
                var rotY = rootAnchor ? node.rotation[1] : bt.rot[1];
                var rotZ = rootAnchor ? node.rotation[2] : bt.rot[2];
                var localMat = matScaled(matRotXYZ(rotX, rotY, rotZ), rootAnchor ? null : bt.scale);
                var fullMat = matMul(parentMat, localMat);
                var px = node.origin[0], py = node.origin[1], pz = node.origin[2];
                var qX = (rootAnchor ? 0 : bt.pos[0]) + px - (localMat[0]*px + localMat[1]*py + localMat[2]*pz);
                var qY = (rootAnchor ? 0 : bt.pos[1]) + py - (localMat[3]*px + localMat[4]*py + localMat[5]*pz);
                var qZ = (rootAnchor ? 0 : bt.pos[2]) + pz - (localMat[6]*px + localMat[7]*py + localMat[8]*pz);
                var nodeTx = parentMat[0]*qX + parentMat[1]*qY + parentMat[2]*qZ + parentTx;
                var nodeTy = parentMat[3]*qX + parentMat[4]*qY + parentMat[5]*qZ + parentTy;
                var nodeTz = parentMat[6]*qX + parentMat[7]*qY + parentMat[8]*qZ + parentTz;
                for (var i = 0; i < node.elementUuids.length; i++) {
                    var e = model.elementsByUuid[node.elementUuids[i]];
                    if (!e) continue;
                    drawElement(e, fullMat, nodeTx, nodeTy, nodeTz);
                }
                for (var c = 0; c < node.children.length; c++) {
                    drawNode(node.children[c], fullMat, nodeTx, nodeTy, nodeTz, false);
                }
            }

            function drawNodeLegacy(node, parentMat, posX, posY, posZ, isRoot) {
                var baseRot = node.inlineRotation || node.rotation;
                var bt = evalBoneTransform(node.uuid, baseRot);
                var rootAnchor = isRoot && isBodyBack;
                var rotX = rootAnchor ? baseRot[0] : bt.rot[0];
                var rotY = rootAnchor ? baseRot[1] : bt.rot[1];
                var rotZ = rootAnchor ? baseRot[2] : bt.rot[2];
                var localMat = matScaled(matRotXYZ(rotX, rotY, rotZ), rootAnchor ? null : bt.scale);
                var fullMat = matMul(parentMat, localMat);
                var p = node.inlineOrigin || node.origin;
                var nPosX = posX + (rootAnchor ? 0 : bt.pos[0]);
                var nPosY = posY + (rootAnchor ? 0 : bt.pos[1]);
                var nPosZ = posZ + (rootAnchor ? 0 : bt.pos[2]);
                var tX = p[0] - (fullMat[0]*p[0] + fullMat[1]*p[1] + fullMat[2]*p[2]) + nPosX;
                var tY = p[1] - (fullMat[3]*p[0] + fullMat[4]*p[1] + fullMat[5]*p[2]) + nPosY;
                var tZ = p[2] - (fullMat[6]*p[0] + fullMat[7]*p[1] + fullMat[8]*p[2]) + nPosZ;
                for (var i = 0; i < node.elementUuids.length; i++) {
                    var e = model.elementsByUuid[node.elementUuids[i]];
                    if (!e) continue;
                    drawElement(e, fullMat, tX, tY, tZ);
                }
                for (var c = 0; c < node.children.length; c++) {
                    drawNodeLegacy(node.children[c], fullMat, nPosX, nPosY, nPosZ, false);
                }
            }

            function runPass() {
                if (model.outliner.length === 0) {
                    for (var ei = 0; ei < model.elements.length; ei++) {
                        drawElement(model.elements[ei], matIdent(), 0, 0, 0);
                    }
                } else {
                    for (var oi = 0; oi < model.outliner.length; oi++) {
                        if (bbmodelLegacy) drawNodeLegacy(model.outliner[oi], matIdent(), 0, 0, 0, true);
                        else drawNode(model.outliner[oi], matIdent(), 0, 0, 0, true);
                    }
                }
            }
            if (isBodyBack) {
                var wingS = 1.3 * pScale;
                passSx = wingS; passSy = wingS; passSz = wingS;
                passOffX = -off[0]; passOffY = off[1]; passOffZ = off[2];
                runPass();
                passSx = -wingS; passSy = wingS; passSz = wingS;
                passOffX = off[0]; passOffY = off[1]; passOffZ = off[2];
                runPass();
            } else {
                runPass();
            }
        }

        if (ssaa > 1) return downsample(buf, w, ssaa, outW, outH);
        return new ImageData(buf, w, h);
    }

    var BB_TIME_STEP = 0.033;
    var BODY_SKIN = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) };

    function findPreviewTime(model, textures, placement) {
        var anim = model.animations && model.animations.length ? model.animations[0] : null;
        if (!anim || !(anim.length > 0)) return 0;
        var scaled = Object.keys(anim.animators).some(function (k) {
            return anim.animators[k].keyframes.some(function (f) { return f.channel === 'scale'; });
        });
        if (!scaled) return 0;
        placement = placement || {};
        var bodyOnly = renderFrame(BODY_SKIN, null, null, null, 160, 160, { rotationY: 150, rotationX: -10, zoom: 0.3 }).data;
        var area = [], max = 0;
        var samples = Math.max(1, Math.floor(anim.length / BB_TIME_STEP));
        for (var k = 0; k < samples; k++) {
            var d = renderFrame(BODY_SKIN, null, null, null, 160, 160, {
                rotationY: 150, rotationX: -10, zoom: 0.3,
                bbmodel: model, bbmodelTextures: textures, bbmodelTime: k * BB_TIME_STEP,
                bbmodelAttachment: placement.bbmodelAttachment,
                bbmodelOffsetX: placement.bbmodelOffsetX, bbmodelOffsetY: placement.bbmodelOffsetY, bbmodelOffsetZ: placement.bbmodelOffsetZ,
                bbmodelRotationY: placement.bbmodelRotationY, bbmodelScale: placement.bbmodelScale
            }).data;
            var a = 0;
            for (var i = 0; i < d.length; i += 4) {
                if (d[i] !== bodyOnly[i] || d[i + 1] !== bodyOnly[i + 1] || d[i + 2] !== bodyOnly[i + 2] || d[i + 3] !== bodyOnly[i + 3]) a++;
            }
            area.push(a);
            if (a > max) max = a;
        }
        if (area[0] * 5 >= max) return 0;
        return area.findIndex(function (v) { return v * 10 >= max * 9; }) * BB_TIME_STEP;
    }

    global.LeafCosmeticRenderer = {
        loadImage: loadImage,
        loadModelByUuid: loadModelByUuid,
        imageToData: imageToData,
        renderFrame: renderFrame,
        findPreviewTime: findPreviewTime
    };
})(window);
