(function () {
    'use strict';
    if (window.__axquenAccountLoaded) return;
    window.__axquenAccountLoaded = true;
    if (window.openAuthModal || document.getElementById('auth-modal')) return;

    var API = 'https://api.chaosworths.com';
    var authMode = 'login';
    var webLinkPoll = null;
    var countdownInterval = null;
    var pendingVerifyEmail = '';
    var resendCooldownInterval = null;

    var AUTH_MODAL_HTML =
        '<div class="modal-overlay hidden" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">' +
            '<div class="modal-content modal-auth">' +
                '<div class="modal-header">' +
                    '<h3 id="auth-modal-title">Sign In</h3>' +
                    '<button class="close-btn" id="close-auth-btn" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
                '</div>' +
                '<div class="modal-body">' +
                    '<div id="auth-screen-main">' +
                        '<div class="auth-tabs-row">' +
                            '<button class="auth-tab-btn active" data-tab="login">Sign In</button>' +
                            '<button class="auth-tab-btn" data-tab="register">Create Account</button>' +
                        '</div>' +
                        '<div style="margin-top:1.25rem;">' +
                            '<button type="button" class="btn-microsoft" id="ms-login-direct-btn">' +
                                '<svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                                    '<rect x="0" y="0" width="10" height="10" fill="#F25022"/>' +
                                    '<rect x="11" y="0" width="10" height="10" fill="#7FBA00"/>' +
                                    '<rect x="0" y="11" width="10" height="10" fill="#00A4EF"/>' +
                                    '<rect x="11" y="11" width="10" height="10" fill="#FFB900"/>' +
                                '</svg> Sign in with Microsoft' +
                            '</button>' +
                            '<button type="button" class="btn-microsoft-launcher" id="ms-login-btn">' +
                                '<svg class="ms-launcher-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Sign in with Microsoft through the launcher' +
                            '</button>' +
                            '<div class="auth-divider"><span>or</span></div>' +
                            '<div class="form-error hidden" id="auth-error"></div>' +
                            '<form id="auth-form" novalidate>' +
                                '<div class="form-group">' +
                                    '<label for="auth-username" id="auth-username-label">Username or email</label>' +
                                    '<input type="text" id="auth-username" placeholder="Username or email" autocomplete="username" required>' +
                                '</div>' +
                                '<div class="form-group hidden" id="auth-email-group">' +
                                    '<label for="auth-email">Email</label>' +
                                    '<input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email">' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label for="auth-password">Password</label>' +
                                    '<input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password" required>' +
                                '</div>' +
                                '<div class="auth-forgot-row" id="auth-forgot-row">' +
                                    '<button type="button" class="auth-link" id="forgot-pw-btn">Forgot password?</button>' +
                                '</div>' +
                                '<div class="form-group hidden" id="auth-referral-group">' +
                                    '<label for="auth-referral">Referral code <span class="auth-optional">(optional)</span></label>' +
                                    '<input type="text" id="auth-referral" placeholder="Have a code? Enter it here" autocomplete="off" maxlength="32">' +
                                '</div>' +
                                '<button type="submit" class="btn-primary btn-full" id="auth-submit-btn" style="margin-top:0.25rem">Sign In</button>' +
                            '</form>' +
                        '</div>' +
                    '</div>' +
                    '<div id="auth-screen-verify" class="hidden">' +
                        '<p class="auth-sub">We sent a 6-digit code to <strong id="verify-email-target"></strong>. Enter it below to confirm your email.</p>' +
                        '<div class="form-error hidden" id="verify-error"></div>' +
                        '<div class="form-success hidden" id="verify-success"></div>' +
                        '<div class="form-group">' +
                            '<label for="verify-code">Verification code</label>' +
                            '<input type="text" id="verify-code" class="auth-code-input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
                        '</div>' +
                        '<button type="button" class="btn-primary btn-full" id="verify-submit-btn">Verify email</button>' +
                        '<div class="auth-alt-row">' +
                            '<button type="button" class="auth-link" id="verify-resend-btn">Resend code</button>' +
                            '<button type="button" class="auth-link" id="verify-skip-btn">Verify later</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="auth-screen-reset" class="hidden">' +
                        '<p class="auth-sub" id="reset-sub">Enter your username or email and we\'ll send you a reset code.</p>' +
                        '<div class="form-error hidden" id="reset-error"></div>' +
                        '<div class="form-success hidden" id="reset-success"></div>' +
                        '<div id="reset-step1">' +
                            '<div class="form-group">' +
                                '<label for="reset-username">Username or email</label>' +
                                '<input type="text" id="reset-username" placeholder="Username or email" autocomplete="username">' +
                            '</div>' +
                            '<button type="button" class="btn-primary btn-full" id="reset-request-btn">Send reset code</button>' +
                        '</div>' +
                        '<div id="reset-step2" class="hidden">' +
                            '<div class="form-group">' +
                                '<label for="reset-code">Reset code</label>' +
                                '<input type="text" id="reset-code" class="auth-code-input" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label for="reset-newpw">New password</label>' +
                                '<input type="password" id="reset-newpw" placeholder="••••••••" autocomplete="new-password">' +
                            '</div>' +
                            '<button type="button" class="btn-primary btn-full" id="reset-confirm-btn">Set new password</button>' +
                        '</div>' +
                        '<div class="auth-alt-row">' +
                            '<button type="button" class="auth-link" id="reset-back-btn">Back to sign in</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var AUTH_CSS = [
        '.auth-tabs-row{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:-20px -22px 0;padding:0 22px;}',
        '.auth-tab-btn{padding:0.85rem 0.9rem;font-size:0.85rem;font-weight:500;color:var(--text2);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.25s var(--sp),border-color 0.25s var(--sp);cursor:pointer;}',
        '.auth-tab-btn:hover{color:var(--text);}',
        '.auth-tab-btn.active{color:var(--green);border-bottom-color:var(--green);}',
        '.form-group{margin-bottom:1rem;}',
        '.form-group label{display:block;font-size:0.8rem;font-weight:500;color:#c9d1c4;margin-bottom:0.4rem;}',
        '.form-group input{width:100%;background:#0b100e;border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:0.7rem 0.9rem;font-size:0.9rem;color:var(--text);font-family:inherit;transition:border-color 0.25s var(--sp),box-shadow 0.25s var(--sp);outline:none;}',
        '.form-group input:focus{border-color:rgba(162,240,123,0.5);box-shadow:0 0 0 3px rgba(162,240,123,0.1);}',
        '.form-group input::placeholder{color:#69735f;}',
        '.auth-optional{color:var(--text3);font-weight:400;font-size:0.72rem;}',
        '.form-error{font-size:0.82rem;color:#f3b2ad;background:rgba(237,135,128,0.08);border:1px solid rgba(237,135,128,0.25);border-radius:9px;padding:0.55rem 0.8rem;margin-bottom:0.8rem;}',
        '.form-success{font-size:0.82rem;color:#cdeebb;background:rgba(162,240,123,0.07);border:1px solid rgba(162,240,123,0.22);border-radius:9px;padding:0.55rem 0.8rem;margin-bottom:0.8rem;}',
        '.auth-sub{font-size:0.88rem;color:var(--text2);line-height:1.6;margin:0 0 1.1rem;}',
        '.auth-sub strong{color:var(--text);font-weight:600;}',
        '.auth-forgot-row{display:flex;justify-content:flex-end;margin:-0.4rem 0 0.9rem;}',
        '.auth-alt-row{display:flex;justify-content:space-between;align-items:center;margin-top:0.9rem;}',
        '.auth-link{background:none;border:none;padding:0;font-size:0.8rem;font-weight:500;color:#bddaa5;cursor:pointer;font-family:inherit;transition:color 0.2s var(--sp);}',
        '.auth-link:hover{color:var(--green);}',
        '.auth-link:disabled{color:var(--text3);cursor:default;}',
        '.auth-code-input{text-align:center;letter-spacing:0.45em;font-size:1.15rem;font-weight:600;font-family:inherit;padding-left:0.45em;}',
        '.modal-content.modal-auth{max-width:410px;}',
        '.btn-microsoft{width:100%;display:flex;align-items:center;justify-content:center;gap:0.65rem;min-height:46px;padding:0 1rem;background:#ffffff;border:1px solid #ffffff;border-radius:9px;font-size:0.9rem;font-weight:600;color:#1f2937;cursor:pointer;transition:background 0.2s var(--sp),border-color 0.2s var(--sp),transform 0.2s var(--sp);}',
        '.btn-microsoft:hover{background:#eef1ec;border-color:#eef1ec;transform:translateY(-1px);}',
        '.btn-microsoft-launcher{width:100%;display:flex;align-items:center;justify-content:center;gap:0.6rem;min-height:44px;padding:0 1rem;background:rgba(162,240,123,0.06);border:1px solid rgba(162,240,123,0.25);border-radius:9px;font-size:0.85rem;font-weight:500;color:#cdeebb;cursor:pointer;transition:background 0.25s var(--sp),border-color 0.25s var(--sp),transform 0.2s var(--sp);margin-top:0.55rem;}',
        '.btn-microsoft-launcher:hover{background:rgba(162,240,123,0.1);border-color:rgba(162,240,123,0.45);transform:translateY(-1px);}',
        '.btn-microsoft-launcher .ms-launcher-icon{color:var(--green);}',
        '.auth-divider{display:flex;align-items:center;gap:0.75rem;margin:1.1rem 0 0.8rem;color:var(--text3);font-size:0.75rem;}',
        '.auth-divider::before,.auth-divider::after{content:"";flex:1;height:1px;background:var(--border);}',
        '.toast-container{position:fixed;bottom:2rem;right:2rem;z-index:600;display:flex;flex-direction:column;gap:0.6rem;pointer-events:none;}',
        '.toast{display:flex;align-items:center;gap:0.6rem;padding:0.7rem 1rem;background:#101513;border:1px solid var(--border);border-radius:10px;font-size:0.82rem;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:lcToastIn 0.4s var(--smooth) forwards;pointer-events:none;max-width:280px;}',
        '.toast.toast-success{border-color:rgba(162,240,123,0.3);}',
        '.toast.toast-error{border-color:rgba(237,135,128,0.3);}',
        '.toast i{font-size:0.9rem;}',
        '.toast.toast-success i{color:var(--green);}',
        '.toast.toast-error i{color:#ed8780;}',
        '.toast.removing{animation:lcToastOut 0.3s var(--sp) forwards;}',
        '@keyframes lcToastIn{from{opacity:0;transform:translateY(12px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}',
        '@keyframes lcToastOut{from{opacity:1;transform:translateY(0) scale(1);}to{opacity:0;transform:translateY(8px) scale(0.95);}}'
    ].join('');

    function injectStyles() {
        if (document.getElementById('axquen-account-css')) return;
        var css = document.createElement('style');
        css.id = 'axquen-account-css';
        css.textContent = AUTH_CSS;
        document.head.appendChild(css);
    }

    function ensureToastContainer() {
        var tc = document.getElementById('toast-container');
        if (!tc) {
            tc = document.createElement('div');
            tc.className = 'toast-container';
            tc.id = 'toast-container';
            document.body.appendChild(tc);
        }
        tc.style.position = 'fixed';
        tc.style.bottom = '2rem';
        tc.style.right = '2rem';
        tc.style.zIndex = '2147483000';
        tc.style.display = 'flex';
        tc.style.flexDirection = 'column';
        tc.style.gap = '0.6rem';
        tc.style.pointerEvents = 'none';
        return tc;
    }

    function ensureDom() {
        ensureToastContainer();
        if (!document.getElementById('auth-modal')) {
            var holder = document.createElement('div');
            holder.innerHTML = AUTH_MODAL_HTML;
            document.body.appendChild(holder.firstChild);
        }
    }

    function showToast(type, message) {
        var container = ensureToastContainer();
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        var accent = type === 'success' ? 'rgba(162,240,123,0.32)' : 'rgba(237,135,128,0.35)';
        toast.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.75rem 1rem;border-radius:11px;font-size:0.82rem;line-height:1.35;max-width:300px;pointer-events:none;opacity:0;transform:translateY(12px);transition:opacity 0.3s ease,transform 0.3s ease;background:#101513;color:#f1f3f0;box-shadow:0 12px 32px rgba(0,0,0,0.5);border:1px solid ' + accent + ';';
        var iconEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconEl.setAttribute('viewBox', '0 0 24 24');
        iconEl.setAttribute('width', '16');
        iconEl.setAttribute('height', '16');
        iconEl.setAttribute('fill', 'none');
        iconEl.setAttribute('stroke', type === 'success' ? '#a2f07b' : '#ed8780');
        iconEl.setAttribute('stroke-width', '2');
        iconEl.setAttribute('stroke-linecap', 'round');
        iconEl.setAttribute('stroke-linejoin', 'round');
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.style.flexShrink = '0';
        iconEl.innerHTML = type === 'success'
            ? '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'
            : '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
        toast.appendChild(iconEl);
        toast.appendChild(document.createTextNode(' ' + (message == null ? '' : String(message))));
        container.appendChild(toast);
        requestAnimationFrame(function () {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(function () { toast.remove(); }, 320);
        }, 3000);
    }

    function fetchCsrfToken() {
        return fetch(API + '/csrf', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { return data && typeof data.token === 'string' ? data.token : null; })
            .catch(function () { return null; });
    }

    function postWithCsrf(path, extraBody) {
        return fetchCsrfToken().then(function (token) {
            if (!token) return null;
            return fetch(API + path, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ csrf_token: token }, extraBody || {}))
            });
        });
    }

    function refreshNav() {
        if (window.lcNavUpdateAccount) window.lcNavUpdateAccount();
    }

    function openAuthModal() {
        ensureDom();
        showScreen('main');
        setAuthMode('login');
        document.getElementById('auth-error').classList.add('hidden');
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-referral').value = '';
        document.getElementById('auth-modal').classList.remove('hidden');
        requestAnimationFrame(function () { document.getElementById('auth-username').focus(); });
    }
    window.openAuthModal = openAuthModal;
    window.closeAuthModal = closeAuthModal;

    function showScreen(name) {
        ['main', 'verify', 'reset'].forEach(function (s) {
            var el = document.getElementById('auth-screen-' + s);
            if (el) el.classList.toggle('hidden', s !== name);
        });
        var title = document.getElementById('auth-modal-title');
        if (title) {
            title.textContent = name === 'verify' ? 'Verify your email'
                : name === 'reset' ? 'Reset password'
                : (authMode === 'register' ? 'Create Account' : 'Sign In');
        }
    }

    function closeAuthModal() {
        var m = document.getElementById('auth-modal');
        if (m) m.classList.add('hidden');
        if (resendCooldownInterval) { clearInterval(resendCooldownInterval); resendCooldownInterval = null; }
    }

    function setAuthMode(mode) {
        authMode = mode;
        document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === mode);
        });
        var isRegister = mode === 'register';
        document.getElementById('auth-submit-btn').textContent = isRegister ? 'Create Account' : 'Sign In';
        document.getElementById('auth-modal-title').textContent = isRegister ? 'Create Account' : 'Sign In';
        document.getElementById('auth-password').setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
        document.getElementById('auth-error').classList.add('hidden');
        var launcherBtn = document.getElementById('ms-login-btn');
        if (launcherBtn) launcherBtn.style.display = isRegister ? 'none' : '';
        var refGroup = document.getElementById('auth-referral-group');
        if (refGroup) refGroup.classList.toggle('hidden', !isRegister);
        var emailGroup = document.getElementById('auth-email-group');
        if (emailGroup) emailGroup.classList.toggle('hidden', !isRegister);
        var forgotRow = document.getElementById('auth-forgot-row');
        if (forgotRow) forgotRow.classList.toggle('hidden', isRegister);
        var unameLabel = document.getElementById('auth-username-label');
        if (unameLabel) unameLabel.textContent = isRegister ? 'Username' : 'Username or email';
        var unameInput = document.getElementById('auth-username');
        if (unameInput) unameInput.placeholder = isRegister ? 'Choose a username' : 'Username or email';
    }

    var USERNAME_RULE = 'Username must be 3 to 16 characters: letters, numbers and underscores only.';
    var PASSWORD_LENGTH_RULE = 'Password must be 8 to 72 characters long.';
    var EMAIL_RULE = 'Please enter a valid email address.';
    var REFERRAL_RULE = 'Referral code must be 3-32 letters or numbers.';
    var CODE_RULE = 'Enter the 6-digit code from your email.';
    var FIELD_RULES = {
        username: USERNAME_RULE,
        password: PASSWORD_LENGTH_RULE,
        new_password: PASSWORD_LENGTH_RULE,
        email: EMAIL_RULE,
        referral_code: REFERRAL_RULE,
        code: CODE_RULE
    };

    function validationMessage(data) {
        var err = data && data.error;
        if (!err || err.code !== 'validation_failed') return null;
        return FIELD_RULES[err.field] || null;
    }

    function isValidEmail(value) {
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
    }

    function validatePasswordStrength(password) {
        if (typeof password !== 'string' || password.length < 8 || password.length > 72) return PASSWORD_LENGTH_RULE;
        if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
        if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one symbol.';
        return null;
    }

    function getDeviceHash() {
        try {
            var id = localStorage.getItem('axquen_device_id');
            if (!id) {
                id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(36).slice(2));
                localStorage.setItem('axquen_device_id', id);
            }
            var enc = new TextEncoder().encode('axquen-web:' + id);
            return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
                var bytes = new Uint8Array(buf), hex = '';
                for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
                return hex;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function parseServerError(status, data, mode) {
        var fallback = mode === 'register' ? 'Could not create account.' : 'Could not sign in.';
        if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
        if (status === 423) return 'Account temporarily locked after too many failed attempts. Try again in about 15 minutes.';
        if (status >= 500) return (data && data.error) || 'Server is having trouble right now. Please try again in a moment.';
        if (!data) return fallback;
        var invalid = mode === 'register' && validationMessage(data);
        if (invalid) return invalid;
        var err = data.error;
        if (typeof err === 'string') {
            if (status === 409 && /email already in use/i.test(err)) return 'That email is already linked to another account.';
            if (status === 409 && /already taken/i.test(err)) return 'That username is already taken. Try a different one.';
            if (status === 401 && /invalid credentials/i.test(err)) return 'Wrong username or password.';
            return err;
        }
        if (err && typeof err.message === 'string') return err.message;
        if (data.message) return data.message;
        return fallback;
    }

    function submitAuth(e) {
        e.preventDefault();
        var errorEl = document.getElementById('auth-error');
        var submitBtn = document.getElementById('auth-submit-btn');
        var username = document.getElementById('auth-username').value.trim();
        var email = document.getElementById('auth-email').value.trim().toLowerCase();
        var password = document.getElementById('auth-password').value;

        errorEl.classList.add('hidden');

        var referral = '';
        if (authMode === 'register') {
            if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
                errorEl.textContent = USERNAME_RULE;
                errorEl.classList.remove('hidden');
                return;
            }
            if (!isValidEmail(email)) {
                errorEl.textContent = EMAIL_RULE;
                errorEl.classList.remove('hidden');
                return;
            }
            var pwErr = validatePasswordStrength(password);
            if (pwErr) {
                errorEl.textContent = pwErr;
                errorEl.classList.remove('hidden');
                return;
            }
            referral = document.getElementById('auth-referral').value.trim();
            if (referral && !/^[a-zA-Z0-9]{3,32}$/.test(referral)) {
                errorEl.textContent = REFERRAL_RULE;
                errorEl.classList.remove('hidden');
                return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.textContent = authMode === 'register' ? 'Creating…' : 'Signing in…';

        var loginBody = JSON.stringify({ username: username, password: password });
        var path = authMode === 'register' ? '/auth/web/register' : '/auth/web/login';
        var devicePromise = (authMode === 'register' && referral) ? getDeviceHash() : Promise.resolve(null);

        devicePromise.then(function (deviceHash) {
            var registerPayload = { username: username, password: password, email: email };
            if (referral) {
                registerPayload.referral_code = referral;
                if (deviceHash) registerPayload.device_hash = deviceHash;
            }
            var body = authMode === 'register' ? JSON.stringify(registerPayload) : loginBody;

            return fetch(API + path, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: body
            }).then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    if (!res.ok) throw new Error(parseServerError(res.status, data, authMode));
                    if (authMode === 'register') return { type: 'registered' };
                    return { type: 'signedin', name: (data.user && data.user.username) || username };
                });
            });
        }).then(function (outcome) {
            refreshNav();
            if (window.lcOnAuthSuccess) { try { window.lcOnAuthSuccess(); } catch (e) {} }
            if (outcome.type === 'registered') {
                showToast('success', 'Account created');
                enterVerifyScreen(email);
            } else {
                closeAuthModal();
                showToast('success', 'Signed in as ' + outcome.name);
            }
        }).catch(function (err) {
            errorEl.textContent = err.message || 'Something went wrong. Please try again.';
            errorEl.classList.remove('hidden');
        }).finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = authMode === 'register' ? 'Create Account' : 'Sign In';
        });
    }

    function mapVerifyError(status, data) {
        var code = data && (data.code || data.error);
        if (code === 'invalid_code') return 'That code is not correct. Please check and try again.';
        if (code === 'expired') return 'That code has expired. Request a new one.';
        if (code === 'too_many_attempts') return 'Too many attempts. Request a new code and try again.';
        if (code === 'no_pending') return 'No pending verification. Request a new code.';
        if (code === 'email_in_use') return 'That email is already used by another account.';
        if (status === 401) return 'Your session expired. Please sign in again, then verify.';
        if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
        return 'Could not verify the code right now. Please try again.';
    }

    function startResendCooldown(seconds) {
        var btn = document.getElementById('verify-resend-btn');
        if (!btn) return;
        if (resendCooldownInterval) clearInterval(resendCooldownInterval);
        var remaining = seconds;
        btn.disabled = true;
        btn.textContent = 'Resend code (' + remaining + 's)';
        resendCooldownInterval = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
                clearInterval(resendCooldownInterval);
                resendCooldownInterval = null;
                btn.disabled = false;
                btn.textContent = 'Resend code';
            } else {
                btn.textContent = 'Resend code (' + remaining + 's)';
            }
        }, 1000);
    }

    function enterVerifyScreen(email) {
        pendingVerifyEmail = email;
        var target = document.getElementById('verify-email-target');
        if (target) target.textContent = email;
        document.getElementById('verify-error').classList.add('hidden');
        document.getElementById('verify-success').classList.add('hidden');
        document.getElementById('verify-code').value = '';
        showScreen('verify');
        startResendCooldown(30);
        requestAnimationFrame(function () { document.getElementById('verify-code').focus(); });
    }

    function submitVerify() {
        var errorEl = document.getElementById('verify-error');
        var successEl = document.getElementById('verify-success');
        var btn = document.getElementById('verify-submit-btn');
        var code = document.getElementById('verify-code').value.trim();
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        if (!/^\d{6}$/.test(code)) {
            errorEl.textContent = CODE_RULE;
            errorEl.classList.remove('hidden');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Verifying…';
        fetch(API + '/user/email/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(mapVerifyError(res.status, data));
            });
        }).then(function () {
            refreshNav();
            closeAuthModal();
            showToast('success', 'Email verified');
        }).catch(function (err) {
            errorEl.textContent = err.message || 'Could not verify the code right now.';
            errorEl.classList.remove('hidden');
        }).finally(function () {
            btn.disabled = false;
            btn.textContent = 'Verify email';
        });
    }

    function resendVerifyCode() {
        var errorEl = document.getElementById('verify-error');
        var successEl = document.getElementById('verify-success');
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        fetch(API + '/user/email/request', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerifyEmail })
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(mapVerifyError(res.status, data));
                startResendCooldown((data && data.resend_in) || 30);
                successEl.textContent = 'A new code is on its way to your inbox.';
                successEl.classList.remove('hidden');
            });
        }).catch(function (err) {
            errorEl.textContent = err.message || 'Could not resend the code right now.';
            errorEl.classList.remove('hidden');
        });
    }

    function enterResetScreen() {
        document.getElementById('reset-error').classList.add('hidden');
        document.getElementById('reset-success').classList.add('hidden');
        document.getElementById('reset-step1').classList.remove('hidden');
        document.getElementById('reset-step2').classList.add('hidden');
        document.getElementById('reset-sub').textContent = 'Enter your username or email and we\'ll send you a reset code.';
        document.getElementById('reset-username').value = document.getElementById('auth-username').value.trim();
        document.getElementById('reset-code').value = '';
        document.getElementById('reset-newpw').value = '';
        showScreen('reset');
        requestAnimationFrame(function () { document.getElementById('reset-username').focus(); });
    }

    function mapResetError(status, data) {
        var invalid = validationMessage(data);
        if (invalid) return invalid;
        var code = data && (data.code || data.error);
        if (code === 'weak_password') return 'That password has appeared in a data breach. Choose a different one.';
        if (code === 'invalid_code' || (status === 400 && code !== 'server_error')) return 'That code is not correct. Please check and try again.';
        if (code === 'expired') return 'That code has expired. Request a new one.';
        if (code === 'too_many_attempts' || status === 429) return 'Too many attempts. Please wait a moment and try again.';
        return 'Could not reset your password right now. Please try again.';
    }

    function requestReset() {
        var errorEl = document.getElementById('reset-error');
        var successEl = document.getElementById('reset-success');
        var btn = document.getElementById('reset-request-btn');
        var username = document.getElementById('reset-username').value.trim();
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        if (username.length < 3 || username.length > 254 || (username.indexOf('@') === -1 && username.length > 16)) {
            errorEl.textContent = 'Enter your username or email.';
            errorEl.classList.remove('hidden');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Sending…';
        fetch(API + '/auth/password/request', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        }).then(function () {
            document.getElementById('reset-step1').classList.add('hidden');
            document.getElementById('reset-step2').classList.remove('hidden');
            document.getElementById('reset-sub').textContent = 'If an email is on that account, a 6-digit code is on its way. Enter it below with your new password.';
            successEl.textContent = 'If that account exists, a reset code is on the way.';
            successEl.classList.remove('hidden');
            requestAnimationFrame(function () { document.getElementById('reset-code').focus(); });
        }).catch(function () {
            errorEl.textContent = 'Could not send a reset code right now. Please try again.';
            errorEl.classList.remove('hidden');
        }).finally(function () {
            btn.disabled = false;
            btn.textContent = 'Send reset code';
        });
    }

    function confirmReset() {
        var errorEl = document.getElementById('reset-error');
        var successEl = document.getElementById('reset-success');
        var btn = document.getElementById('reset-confirm-btn');
        var username = document.getElementById('reset-username').value.trim();
        var code = document.getElementById('reset-code').value.trim();
        var newPw = document.getElementById('reset-newpw').value;
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        if (!/^\d{6}$/.test(code)) {
            errorEl.textContent = CODE_RULE;
            errorEl.classList.remove('hidden');
            return;
        }
        var pwErr = validatePasswordStrength(newPw);
        if (pwErr) {
            errorEl.textContent = pwErr;
            errorEl.classList.remove('hidden');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Saving…';
        fetch(API + '/auth/password/reset', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, code: code, new_password: newPw })
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(mapResetError(res.status, data));
            });
        }).then(function () {
            showScreen('main');
            setAuthMode('login');
            document.getElementById('auth-username').value = username;
            document.getElementById('auth-password').value = '';
            showToast('success', 'Password updated. You can sign in now.');
            requestAnimationFrame(function () { document.getElementById('auth-password').focus(); });
        }).catch(function (err) {
            errorEl.textContent = err.message || 'Could not reset your password right now.';
            errorEl.classList.remove('hidden');
        }).finally(function () {
            btn.disabled = false;
            btn.textContent = 'Set new password';
        });
    }

    function startMicrosoftDirectLogin() {
        window.location.assign(API + '/auth/microsoft/redirect');
    }

    function adoptTokens(accessToken, refreshToken) {
        return postWithCsrf('/auth/web/adopt', { accessToken: accessToken, refreshToken: refreshToken })
            .then(function (res) { return !!(res && res.ok); })
            .catch(function () { return false; });
    }

    function formatCountdown(s) {
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return m + ':' + String(sec).padStart(2, '0');
    }

    function startWebLinkCountdown(seconds) {
        if (countdownInterval) clearInterval(countdownInterval);
        var remaining = seconds;
        var el = document.getElementById('weblink-countdown');
        if (el) el.textContent = formatCountdown(remaining);
        countdownInterval = setInterval(function () {
            remaining--;
            if (el) el.textContent = formatCountdown(remaining);
            if (remaining <= 0) { clearInterval(countdownInterval); countdownInterval = null; }
        }, 1000);
    }

    function showWebLinkOverlay(code, expiresIn) {
        var overlay = document.getElementById('weblink-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'weblink-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,12,0.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
            overlay.innerHTML =
                '<div style="background:#101513;border:1px solid rgba(162,240,123,0.15);border-radius:18px;padding:2rem;max-width:420px;width:100%;text-align:center;box-shadow:0 0 80px rgba(162,240,123,0.07),0 30px 100px rgba(0,0,0,0.53);">' +
                    '<div style="display:flex;justify-content:center;margin-bottom:1.25rem;">' +
                        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a2f07b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                            '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
                            '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
                        '</svg>' +
                    '</div>' +
                    '<h3 style="margin:0 0 0.5rem;font-size:1.2rem;font-weight:600;letter-spacing:-0.3px;">Link Launcher Account</h3>' +
                    '<p style="color:var(--text2,#a6b0aa);font-size:0.875rem;line-height:1.6;margin:0 0 1.25rem;">Open the Axquen Client launcher, go to the <strong style="color:#f1f3f0;">Accounts</strong> tab, click <strong style="color:#f1f3f0;">"Link Website"</strong> and enter this code:</p>' +
                    '<div style="background:rgba(162,240,123,0.04);border:1px dashed rgba(162,240,123,0.3);border-radius:12px;padding:1rem;margin-bottom:0.75rem;">' +
                        '<div id="weblink-code" style="font-size:2rem;font-weight:650;letter-spacing:0.3em;font-family:inherit;color:#a2f07b;">------</div>' +
                    '</div>' +
                    '<p style="color:var(--text2,#a6b0aa);font-size:0.8rem;margin:0 0 1rem;">Expires in <span id="weblink-countdown">5:00</span></p>' +
                    '<button id="weblink-cancel" type="button" style="width:100%;min-height:44px;padding:0 1rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.13);border-radius:9px;color:#e1e5de;cursor:pointer;font-size:0.875rem;font-weight:600;">Cancel</button>' +
                '</div>';
            document.body.appendChild(overlay);
            document.getElementById('weblink-cancel').addEventListener('click', cancelWebLink);
        }
        document.getElementById('weblink-code').textContent = code;
        overlay.style.display = 'flex';
        startWebLinkCountdown(expiresIn);
    }

    function hideWebLinkOverlay() {
        var overlay = document.getElementById('weblink-overlay');
        if (overlay) overlay.style.display = 'none';
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    function cancelWebLink() {
        if (webLinkPoll) { clearInterval(webLinkPoll); webLinkPoll = null; }
        hideWebLinkOverlay();
    }

    function pollWebLink(code, secret) {
        if (webLinkPoll) clearInterval(webLinkPoll);
        webLinkPoll = setInterval(function () {
            fetch(API + '/auth/microsoft/weblink/status/' + encodeURIComponent(code), secret ? { headers: { 'X-Link-Secret': secret } } : {})
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.status === 'pending') return;
                    clearInterval(webLinkPoll); webLinkPoll = null;
                    if (data.status === 'success') {
                        adoptTokens(data.accessToken, data.refreshToken).then(function (ok) {
                            hideWebLinkOverlay();
                            if (!ok) { showToast('error', 'Could not establish session. Please try again.'); return; }
                            refreshNav();
                            if (window.lcOnAuthSuccess) { try { window.lcOnAuthSuccess(); } catch (e) {} }
                            showToast('success', 'Signed in with Microsoft!');
                        });
                    } else {
                        hideWebLinkOverlay();
                        var msg = data.status === 'expired' ? 'Link code expired. Please try again.' : 'Microsoft sign-in failed.';
                        showToast('error', msg);
                    }
                })
                .catch(function () {});
        }, 3000);
    }

    function startMicrosoftWebLink() {
        fetch(API + '/auth/microsoft/weblink/start', { method: 'POST' })
            .then(function (res) {
                if (!res.ok) { showToast('error', 'Could not start Microsoft sign-in.'); return; }
                return res.json().then(function (data) {
                    closeAuthModal();
                    showWebLinkOverlay(data.linkCode, data.expiresIn);
                    pollWebLink(data.linkCode, data.pollSecret);
                });
            })
            .catch(function () { showToast('error', 'Could not start Microsoft sign-in.'); });
    }

    function wireModal() {
        var closeBtn = document.getElementById('close-auth-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
        var modal = document.getElementById('auth-modal');
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeAuthModal(); });
        document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { setAuthMode(btn.dataset.tab); });
        });
        var form = document.getElementById('auth-form');
        if (form) form.addEventListener('submit', submitAuth);
        var msDirect = document.getElementById('ms-login-direct-btn');
        if (msDirect) msDirect.addEventListener('click', startMicrosoftDirectLogin);
        var msLauncher = document.getElementById('ms-login-btn');
        if (msLauncher) msLauncher.addEventListener('click', startMicrosoftWebLink);

        var forgotBtn = document.getElementById('forgot-pw-btn');
        if (forgotBtn) forgotBtn.addEventListener('click', enterResetScreen);

        var verifySubmit = document.getElementById('verify-submit-btn');
        if (verifySubmit) verifySubmit.addEventListener('click', submitVerify);
        var verifyResend = document.getElementById('verify-resend-btn');
        if (verifyResend) verifyResend.addEventListener('click', resendVerifyCode);
        var verifySkip = document.getElementById('verify-skip-btn');
        if (verifySkip) verifySkip.addEventListener('click', closeAuthModal);
        var verifyCode = document.getElementById('verify-code');
        if (verifyCode) verifyCode.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitVerify(); } });

        var resetRequest = document.getElementById('reset-request-btn');
        if (resetRequest) resetRequest.addEventListener('click', requestReset);
        var resetConfirm = document.getElementById('reset-confirm-btn');
        if (resetConfirm) resetConfirm.addEventListener('click', confirmReset);
        var resetBack = document.getElementById('reset-back-btn');
        if (resetBack) resetBack.addEventListener('click', function () { showScreen('main'); setAuthMode('login'); });
        var resetUsername = document.getElementById('reset-username');
        if (resetUsername) resetUsername.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); requestReset(); } });
        var resetNewpw = document.getElementById('reset-newpw');
        if (resetNewpw) resetNewpw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmReset(); } });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeAuthModal();
        });
    }

    function init() {
        injectStyles();
        ensureDom();
        wireModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
