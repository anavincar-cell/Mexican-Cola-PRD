// Admin login: one account, set in Railway Variables.
// The session is a signed cookie, so no session table is needed.
const crypto = require('crypto');

const COOKIE = 'mc_admin';
const MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours

function secret() {
  return process.env.SESSION_SECRET || '';
}

function isConfigured() {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && secret().length >= 32);
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

// Compares two strings in constant time, so the time taken does not leak the answer.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkLogin(email, password) {
  if (!isConfigured()) return false;
  const emailOk = safeEqual(String(email).trim().toLowerCase(), process.env.ADMIN_EMAIL.trim().toLowerCase());
  const passOk = safeEqual(password, process.env.ADMIN_PASSWORD);
  return emailOk && passOk;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setSession(res) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `admin.${expires}`;
  const value = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${MAX_AGE_SECONDS}${secure}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0`);
}

function isLoggedIn(req) {
  if (!isConfigured()) return false;
  const value = parseCookies(req)[COOKIE];
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], sign(payload))) return false;
  return Number(parts[1]) > Date.now() / 1000;
}

// Blocks every admin page for visitors who are not logged in.
function requireAdmin(req, res, next) {
  if (isLoggedIn(req)) return next();
  return res.redirect(303, '/admin/login');
}

// Extra protection for admin forms: the request must come from our own site.
function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (new URL(origin).host !== host) return res.status(403).send('Forbidden');
  }
  return next();
}

module.exports = { isConfigured, checkLogin, setSession, clearSession, isLoggedIn, requireAdmin, sameOrigin };
