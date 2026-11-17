// Admin login. Admin users live in the admin_users table.
// Passwords are stored only as scrypt hashes, never as plain text.
// The session is a signed cookie, so no session table is needed.
const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'mc_admin';
const MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours
const MIN_PASSWORD_LENGTH = 12;

// scrypt settings: N=16384, r=8, p=1, 64-byte key. Stored with the hash so they can change later.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function secret() {
  return process.env.SESSION_SECRET || '';
}

function isConfigured() {
  return db.hasDatabase() && secret().length >= 32;
}

function scryptAsync(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Returns a string like: scrypt$16384$8$1$<salt>$<hash>
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const key = await scryptAsync(String(password), Buffer.from(saltB64, 'base64url'), {
    N: Number(N), r: Number(r), p: Number(p), keylen: expected.length,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Used when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash = null;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function passwordProblem(password) {
  if (String(password || '').length < MIN_PASSWORD_LENGTH) return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (String(password).length > 200) return 'The password is too long.';
  return '';
}

// Returns the admin user on success, or null.
async function checkLogin(email, password) {
  if (!isConfigured()) return null;
  const user = (await db.query('SELECT * FROM admin_users WHERE email = $1', [normaliseEmail(email)])).rows[0];
  const ok = await verifyPassword(password, user ? user.password_hash : await getDummyHash());
  if (!user || !ok) return null;
  await db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [user.id]);
  return user;
}

// Creates the first admin from ADMIN_EMAIL and ADMIN_PASSWORD, once.
// After that the plain password in Railway is not needed and should be deleted.
// ADMIN_RESET_PASSWORD=true overwrites that admin's password (for a forgotten password).
async function bootstrapAdmin() {
  if (!db.hasDatabase()) return;
  const email = normaliseEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  const count = (await db.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n;

  if (email && password) {
    const problem = passwordProblem(password);
    const existing = (await db.query('SELECT id FROM admin_users WHERE email = $1', [email])).rows[0];
    if (count === 0) {
      if (problem) { console.log(`Admin not created: ${problem}`); return; }
      await db.query('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [email, await hashPassword(password)]);
      console.log('First admin user created from ADMIN_EMAIL. Its password is stored hashed. Now delete ADMIN_PASSWORD from Railway Variables.');
      return;
    }
    if (existing && process.env.ADMIN_RESET_PASSWORD === 'true') {
      if (problem) { console.log(`Password not reset: ${problem}`); return; }
      await db.query('UPDATE admin_users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [await hashPassword(password), existing.id]);
      console.log('Admin password reset from ADMIN_PASSWORD. Now delete ADMIN_PASSWORD and ADMIN_RESET_PASSWORD from Railway Variables.');
      return;
    }
    console.log('ADMIN_PASSWORD is still set in Railway but is not used. Delete it from Railway Variables.');
    return;
  }
  if (count === 0) console.log('No admin user yet: set ADMIN_EMAIL and ADMIN_PASSWORD once, then redeploy.');
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// Cookie: <userId>.<sessionVersion>.<expires>.<signature>
// Changing a password raises session_version, which logs out every old session of that user.
function setSession(res, user) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${user.id}.${user.session_version}.${expires}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${MAX_AGE_SECONDS}${secure}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0`);
}

function safeEqualStrings(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Returns the logged-in admin user, or null.
async function currentUser(req) {
  if (!isConfigured()) return null;
  const value = parseCookies(req)[COOKIE];
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [id, version, expires, signature] = parts;
  if (!safeEqualStrings(signature, sign(`${id}.${version}.${expires}`))) return null;
  if (!(Number(expires) > Date.now() / 1000)) return null;
  const user = (await db.query('SELECT id, email, session_version FROM admin_users WHERE id = $1', [Number(id)])).rows[0];
  if (!user || String(user.session_version) !== version) return null;
  return user;
}

// Blocks every admin page for visitors who are not logged in.
async function requireAdmin(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.redirect(303, '/admin/login');
    req.admin = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Extra protection for admin forms: the request must come from our own site.
function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* bad origin */ }
    if (originHost !== host) return res.status(403).send('Forbidden');
  }
  return next();
}

module.exports = {
  MIN_PASSWORD_LENGTH, isConfigured, hashPassword, verifyPassword, passwordProblem, normaliseEmail,
  checkLogin, bootstrapAdmin, setSession, clearSession, currentUser, requireAdmin, sameOrigin,
};
