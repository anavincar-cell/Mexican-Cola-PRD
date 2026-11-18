// The Mexican Cola website: public pages, the tasting form, and the admin side.
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const db = require('./db');
const auth = require('./auth');
const views = require('./views');
const { classify } = require('./source');
const mailer = require('./mailer');
const visits = require('./visits');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits in front of the app.

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(compression()); // Smaller pages: faster on phones.
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb', type: ['application/json', 'text/plain'] }));

// ---------- Health check (Railway can use this) ----------
app.get('/health', (req, res) => res.json({ ok: true, database: db.hasDatabase() }));

// ---------- Settings for the page (no secrets: the Measurement ID is public by design) ----------
app.get('/config.js', (req, res) => {
  const id = String(process.env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  const gaId = /^G-[A-Z0-9]{4,20}$/.test(id) ? id : '';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`window.MC_CONFIG=${JSON.stringify({ gaId })};`);
});

// ---------- Our own visit counter and button clicks ----------
app.post('/api/visit', async (req, res) => {
  try { await visits.recordVisit(req); } catch (err) { console.error('Visit not counted:', err.message); }
  res.status(204).end();
});
app.post('/api/event', async (req, res) => {
  try { await visits.recordEvent(req); } catch (err) { console.error('Event not counted:', err.message); }
  res.status(204).end();
});

// ---------- Finding and sharing the page (SEO) ----------
// The public address, used in the share preview, canonical link and sitemap.
const DEFAULT_SITE = 'https://mexican-cola-prd-production.up.railway.app';
function siteUrl() {
  const u = String(process.env.SITE_URL || DEFAULT_SITE).trim().replace(/\/+$/, '');
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u) ? u : DEFAULT_SITE;
}

// Google Search Console "HTML tag" check. GOOGLE_SITE_VERIFICATION holds only the content value.
function verificationTag() {
  const v = String(process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  return /^[A-Za-z0-9_-]{10,100}$/.test(v) ? `<meta name="google-site-verification" content="${v}">` : '';
}

const indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
function sendHome(req, res) {
  const html = indexTemplate.split('%SITE_URL%').join(siteUrl())
    .replace('<!-- Search Console verification goes here -->', verificationTag());
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
}
app.get(['/', '/index.html'], sendHome);

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /thanks\n\nSitemap: ${siteUrl()}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl()}/</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`);
});

// ---------- Public website ----------
// Photos and icons rarely change: browsers keep them for 7 days. Pages and scripts are checked every time.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, file) {
    if (/\.(jpe?g|png|webp|svg|ico)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Simple in-memory limit: 5 form submissions per visitor per hour.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function sendEmailsLater(enquiry, adminUrl) {
  setImmediate(async () => {
    try {
      const r = await mailer.sendEnquiryEmails(enquiry, { adminUrl });
      const error = [r.thankYouError && `thank-you: ${r.thankYouError}`, r.alertError && `alert: ${r.alertError}`].filter(Boolean).join(' | ').slice(0, 300);
      await db.query('UPDATE enquiries SET thank_you_email = $1, alert_email = $2, email_error = $3 WHERE id = $4', [r.thankYou, r.alert, error, enquiry.id]);
      console.log(`Emails for #${enquiry.id}: thank-you ${r.thankYou}, alert ${r.alert}${error ? ` (${error})` : ''}`);
    } catch (err) {
      console.error(`Emails for #${enquiry.id} crashed:`, err.message);
    }
  });
}

app.post('/api/enquiry', async (req, res) => {
  const b = req.body || {};
  // Hidden trap field: real visitors leave it empty, spam bots fill it in.
  if (clean(b.website, 200)) return res.json({ ok: true });

  const name = clean(b.name, 120);
  const email = clean(b.email, 200).toLowerCase();
  const city = db.CITIES.includes(b.city) ? b.city : '';
  const language = b.language === 'th' ? 'th' : 'en';
  const preferred = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(b.preferred_date || '') ? b.preferred_date : '';

  if (!name) return res.status(400).json({ ok: false, error: 'name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'email' });
  if (rateLimited(req.ip)) return res.status(429).json({ ok: false, error: 'too_many' });
  if (!db.hasDatabase()) return res.status(503).json({ ok: false, error: 'not_ready' });

  try {
    const src = classify(typeof b.src === 'object' && b.src ? b.src : {}, req.headers['x-forwarded-host'] || req.headers.host);
    const { rows } = await db.query(
      `INSERT INTO enquiries (name, email, current_cola, venue, phone, city, preferred_date, language, source, medium, campaign, referrer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, email, clean(b.cola, 200), clean(b.venue, 200), clean(b.phone, 60), city, preferred, language,
        src.source, src.medium, src.campaign, src.referrer],
    );
    await db.query('INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status) VALUES ($1, NULL, $2)', [rows[0].id, 'New']);
    // No personal data in the logs: only the id.
    console.log(`New enquiry saved: #${rows[0].id}`);
    res.json({ ok: true });

    // The emails go out after the visitor already has their answer.
    // If Mailgun fails, the enquiry stays saved and the visitor sees no error.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    sendEmailsLater(rows[0], `${proto}://${host}/admin/enquiries/${rows[0].id}`);
    return undefined;
  } catch (err) {
    console.error('Could not save enquiry:', err.message);
    return res.status(500).json({ ok: false, error: 'server' });
  }
});

// ---------- Admin side ----------
const admin = express.Router();
admin.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const loginFails = new Map();
admin.get('/login', async (req, res, next) => {
  try {
    if (await auth.currentUser(req)) return res.redirect(303, '/admin');
    res.send(views.loginPage({ notConfigured: !auth.isConfigured() }));
  } catch (err) { next(err); }
});

admin.post('/login', auth.sameOrigin, async (req, res, next) => {
  try {
    const now = Date.now();
    const fails = (loginFails.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (fails.length >= 10) {
      return res.status(429).send(views.loginPage({ error: 'Too many tries. Wait 15 minutes, then try again.' }));
    }
    const { email = '', password = '' } = req.body || {};
    const user = await auth.checkLogin(email, password);
    if (user) {
      loginFails.delete(req.ip);
      auth.setSession(res, user);
      return res.redirect(303, '/admin');
    }
    fails.push(now);
    loginFails.set(req.ip, fails);
    if (loginFails.size > 5000) loginFails.clear();
    return res.status(401).send(views.loginPage({
      error: 'Wrong email or password.',
      notConfigured: !auth.isConfigured(),
    }));
  } catch (err) { next(err); }
});

admin.post('/logout', auth.sameOrigin, (req, res) => {
  auth.clearSession(res);
  res.redirect(303, '/admin/login');
});

// Everything below needs a login.
admin.use(auth.requireAdmin);

function readFilters(q) {
  return {
    q: clean(q.q, 100),
    status: db.STATUSES.includes(q.status) ? q.status : '',
    city: db.CITIES.includes(q.city) ? q.city : '',
  };
}

async function findEnquiries(filters) {
  const where = [];
  const params = [];
  if (filters.q) {
    params.push(`%${filters.q.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
    where.push(`(name ILIKE $${params.length} OR venue ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (filters.status) { params.push(filters.status); where.push(`status = $${params.length}`); }
  if (filters.city) { params.push(filters.city); where.push(`city = $${params.length}`); }
  const sql = `SELECT * FROM enquiries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 2000`;
  return (await db.query(sql, params)).rows;
}

admin.get('/', async (req, res, next) => {
  const filters = readFilters(req.query);
  const counts = { newThisWeek: 0, tastingsBooked: 0, orders: 0, total: 0 };
  if (!db.hasDatabase()) return res.send(views.listPage({ rows: [], counts, filters, dbReady: false }));
  try {
    const rows = await findEnquiries(filters);
    const c = (await db.query(`SELECT
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS new_this_week,
        count(*) FILTER (WHERE status = 'Tasting booked')::int AS tastings_booked,
        count(*) FILTER (WHERE status = 'Ordered')::int AS orders,
        count(*)::int AS total
      FROM enquiries`)).rows[0];
    res.send(views.listPage({
      rows, filters, dbReady: true,
      counts: { newThisWeek: c.new_this_week, tastingsBooked: c.tastings_booked, orders: c.orders, total: c.total },
    }));
  } catch (err) { next(err); }
});

// Stops spreadsheet programs from running a cell as a formula.
function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

admin.get('/export.csv', async (req, res, next) => {
  if (!db.hasDatabase()) return res.status(503).send('Database not connected');
  try {
    const rows = await findEnquiries(readFilters(req.query));
    const header = ['Date', 'Name', 'Email', 'Phone or LINE', 'Venue', 'City', 'Current cola', 'Preferred tasting', 'Language', 'Status', 'Source', 'Medium', 'Campaign'];
    const lines = [header.map(csvCell).join(',')].concat(rows.map((r) => [
      views.fmtDate(r.created_at), r.name, r.email, r.phone, r.venue, r.city, r.current_cola,
      views.fmtPreferred(r.preferred_date), r.language.toUpperCase(), r.status,
      views.sourceLabel(r.source), r.medium, r.campaign,
    ].map(csvCell).join(',')));
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="enquiries-${p.day}.${p.month}.${p.year}.csv"`);
    res.send('﻿' + lines.join('\r\n')); // The mark at the start makes Excel read Thai text correctly.
  } catch (err) { next(err); }
});

function enquiryId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

admin.get('/enquiries/:id', async (req, res, next) => {
  const id = enquiryId(req);
  if (!id || !db.hasDatabase()) return res.status(404).send(views.notFoundPage());
  try {
    const e = (await db.query('SELECT * FROM enquiries WHERE id = $1', [id])).rows[0];
    if (!e) return res.status(404).send(views.notFoundPage());
    const notes = (await db.query('SELECT * FROM enquiry_notes WHERE enquiry_id = $1 ORDER BY created_at DESC', [id])).rows;
    const history = (await db.query('SELECT * FROM enquiry_status_history WHERE enquiry_id = $1 ORDER BY changed_at DESC, id DESC', [id])).rows;
    const flash = { status: 'Status saved.', note: 'Note added.' }[req.query.saved] || '';
    res.send(views.detailPage({ e, notes, history, flash }));
  } catch (err) { next(err); }
});

admin.post('/enquiries/:id/status', auth.sameOrigin, async (req, res, next) => {
  const id = enquiryId(req);
  const status = (req.body || {}).status;
  if (!id || !db.STATUSES.includes(status)) return res.status(400).send('Bad request');
  try {
    const old = (await db.query('SELECT status FROM enquiries WHERE id = $1', [id])).rows[0];
    if (!old) return res.status(404).send(views.notFoundPage());
    if (old.status !== status) {
      await db.query('UPDATE enquiries SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
      await db.query('INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status) VALUES ($1,$2,$3)', [id, old.status, status]);
    }
    res.redirect(303, `/admin/enquiries/${id}?saved=status`);
  } catch (err) { next(err); }
});

admin.post('/enquiries/:id/notes', auth.sameOrigin, async (req, res, next) => {
  const id = enquiryId(req);
  const body = String((req.body || {}).body || '').trim().slice(0, 2000);
  if (!id || !body) return res.status(400).send('Bad request');
  try {
    const exists = (await db.query('SELECT 1 FROM enquiries WHERE id = $1', [id])).rowCount;
    if (!exists) return res.status(404).send(views.notFoundPage());
    await db.query('INSERT INTO enquiry_notes (enquiry_id, body) VALUES ($1,$2)', [id, body]);
    await db.query('UPDATE enquiries SET updated_at = now() WHERE id = $1', [id]);
    res.redirect(303, `/admin/enquiries/${id}?saved=note`);
  } catch (err) { next(err); }
});

// ---------- Report ----------
// All dates in Thailand time. A week runs Monday to Sunday.
admin.get('/report', async (req, res, next) => {
  if (!db.hasDatabase()) return res.status(503).send('Database not connected');
  try {
    const TZ = 'Asia/Bangkok';
    const weeks = (await db.query(`
      WITH b AS (SELECT date_trunc('week', now() AT TIME ZONE $1) AS this_week, (now() AT TIME ZONE $1)::date AS today)
      SELECT
        (SELECT count(*)::int FROM enquiries, b WHERE created_at AT TIME ZONE $1 >= b.this_week) AS this_week,
        (SELECT count(*)::int FROM enquiries, b WHERE created_at AT TIME ZONE $1 >= b.this_week - interval '7 days'
                                                  AND created_at AT TIME ZONE $1 <  b.this_week) AS last_week,
        (SELECT count(*)::int FROM enquiries, b WHERE created_at AT TIME ZONE $1 >= b.this_week - interval '7 days'
                                                  AND (created_at AT TIME ZONE $1)::date - (b.this_week - interval '7 days')::date
                                                      <= b.today - b.this_week::date) AS last_week_same_days,
        (SELECT this_week::date FROM b) AS week_start,
        (SELECT today FROM b) AS today,
        (SELECT count(*)::int FROM enquiries) AS total`, [TZ])).rows[0];

    const statusRows = (await db.query('SELECT status, count(*)::int AS n FROM enquiries GROUP BY status', [])).rows;
    const byStatus = db.STATUSES.map((s) => ({ status: s, n: (statusRows.find((r) => r.status === s) || {}).n || 0 }));

    const perDay = (await db.query(`
      SELECT d::date AS day, count(e.id)::int AS n
      FROM generate_series((now() AT TIME ZONE $1)::date - 29, (now() AT TIME ZONE $1)::date, interval '1 day') AS d
      LEFT JOIN enquiries e ON (e.created_at AT TIME ZONE $1)::date = d::date
      GROUP BY d ORDER BY d`, [TZ])).rows;

    const sources = (await db.query(`
      SELECT source, count(*)::int AS n,
             count(*) FILTER (WHERE status = 'Ordered')::int AS ordered
      FROM enquiries GROUP BY source ORDER BY n DESC, source`)).rows;

    // Visitors from our own counter. A visitor = one daily code on one day.
    const t = (await db.query(`
      WITH b AS (SELECT (now() AT TIME ZONE $1)::date AS today, date_trunc('week', now() AT TIME ZONE $1)::date AS ws),
      started AS (SELECT min(created_at) AS at, min(day) AS day FROM visits),
      dv AS (SELECT DISTINCT day, visitor FROM visits),
      dc AS (SELECT DISTINCT day, visitor FROM events WHERE type = 'cta_click'),
      en AS (SELECT (e.created_at AT TIME ZONE $1)::date AS day FROM enquiries e, started s WHERE s.at IS NOT NULL AND e.created_at >= s.at)
      SELECT
        (SELECT count(*)::int FROM dv, b WHERE day >= b.ws) AS tw_v,
        (SELECT count(*)::int FROM en, b WHERE day >= b.ws) AS tw_e,
        (SELECT count(*)::int FROM dv, b WHERE day >= b.ws - 7 AND day < b.ws) AS lw_v,
        (SELECT count(*)::int FROM en, b WHERE day >= b.ws - 7 AND day < b.ws) AS lw_e,
        (SELECT count(*)::int FROM dv, b WHERE day >= b.today - 29) AS m_v,
        (SELECT count(*)::int FROM en, b WHERE day >= b.today - 29) AS m_e,
        (SELECT count(*)::int FROM dc, b WHERE day >= b.today - 29) AS m_clickers,
        (SELECT count(*)::int FROM events, b WHERE type = 'cta_click' AND day >= b.today - 29) AS m_clicks,
        (SELECT day FROM started) AS started`, [TZ])).rows[0];
    const visitorsPerDay = (await db.query(`
      SELECT d::date AS day, count(DISTINCT v.visitor)::int AS n
      FROM generate_series((now() AT TIME ZONE $1)::date - 29, (now() AT TIME ZONE $1)::date, interval '1 day') AS d
      LEFT JOIN visits v ON v.day = d::date
      GROUP BY d ORDER BY d`, [TZ])).rows;
    const devices = (await db.query(`
      SELECT device, count(*)::int AS n FROM (SELECT DISTINCT day, visitor, device FROM visits
        WHERE day >= (now() AT TIME ZONE $1)::date - 29) x GROUP BY device ORDER BY n DESC`, [TZ])).rows;
    const traffic = {
      thisWeek: { visitors: t.tw_v, enquiries: t.tw_e },
      lastWeek: { visitors: t.lw_v, enquiries: t.lw_e },
      last30: { visitors: t.m_v, enquiries: t.m_e, clickers: t.m_clickers, clicks: t.m_clicks },
      started: t.started, perDay: visitorsPerDay, devices,
    };

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    res.send(views.reportPage({ weeks, byStatus, perDay, sources, traffic, siteUrl: `${proto}://${host}` }));
  } catch (err) { next(err); }
});

// ---------- Admin users ----------
async function listAdmins() {
  return (await db.query('SELECT id, email, created_at, last_login_at FROM admin_users ORDER BY created_at')).rows;
}

admin.get('/users', async (req, res, next) => {
  try {
    const flash = { added: 'Admin user added.', removed: 'Admin user removed.' }[req.query.saved] || '';
    res.send(views.usersPage({ users: await listAdmins(), me: req.admin, flash }));
  } catch (err) { next(err); }
});

admin.post('/users', auth.sameOrigin, async (req, res, next) => {
  try {
    const email = auth.normaliseEmail((req.body || {}).email);
    const { password = '', confirm = '' } = req.body || {};
    let error = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Please enter a valid email.';
    else if (password !== confirm) error = 'The two passwords do not match.';
    else error = auth.passwordProblem(password);
    if (!error) {
      const taken = (await db.query('SELECT 1 FROM admin_users WHERE email = $1', [email])).rowCount;
      if (taken) error = 'This email is already an admin user.';
    }
    if (error) return res.status(400).send(views.usersPage({ users: await listAdmins(), me: req.admin, error, emailValue: email }));
    await db.query('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [email, await auth.hashPassword(password)]);
    console.log(`Admin user added by admin #${req.admin.id}`);
    res.redirect(303, '/admin/users?saved=added');
  } catch (err) { next(err); }
});

admin.post('/users/:id/remove', auth.sameOrigin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Bad request');
    if (id === req.admin.id) {
      return res.status(400).send(views.usersPage({ users: await listAdmins(), me: req.admin, error: 'You cannot remove yourself.' }));
    }
    await db.query('DELETE FROM admin_users WHERE id = $1', [id]);
    console.log(`Admin user #${id} removed by admin #${req.admin.id}`);
    res.redirect(303, '/admin/users?saved=removed');
  } catch (err) { next(err); }
});

// ---------- Change your own password ----------
admin.get('/account', (req, res) => {
  res.send(views.accountPage({ me: req.admin, flash: req.query.saved === 'password' ? 'Password changed.' : '' }));
});

admin.post('/account/password', auth.sameOrigin, async (req, res, next) => {
  try {
    const { current = '', password = '', confirm = '' } = req.body || {};
    const row = (await db.query('SELECT * FROM admin_users WHERE id = $1', [req.admin.id])).rows[0];
    let error = '';
    if (!row || !(await auth.verifyPassword(current, row.password_hash))) error = 'Your current password is wrong.';
    else if (password !== confirm) error = 'The two new passwords do not match.';
    else if (password === current) error = 'The new password must be different.';
    else error = auth.passwordProblem(password);
    if (error) return res.status(400).send(views.accountPage({ me: req.admin, error }));
    const updated = (await db.query(
      'UPDATE admin_users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 RETURNING id, email, session_version',
      [await auth.hashPassword(password), row.id],
    )).rows[0];
    auth.setSession(res, updated); // Keeps you logged in here; logs out your other devices.
    console.log(`Admin #${row.id} changed their password`);
    res.redirect(303, '/admin/account?saved=password');
  } catch (err) { next(err); }
});

app.use('/admin', admin);

// ---------- Errors ----------
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Server error:', err.message);
  res.status(500).send('Something went wrong. Please try again.');
});

// ---------- Start ----------
async function start() {
  try {
    if (await db.migrate()) {
      console.log('Database ready.');
      await auth.bootstrapAdmin();
    } else {
      console.log('No DATABASE_URL yet: the website runs, but the form cannot save enquiries.');
    }
  } catch (err) {
    console.error('Database setup failed:', err.message);
  }
  console.log(mailer.isConfigured() ? 'Emails are on (Mailgun).' : 'Emails are off: set MAILGUN_API_KEY and MAILGUN_DOMAIN to send thank-you emails.');
  if (!auth.isConfigured()) console.log('Admin login is off: it needs DATABASE_URL and SESSION_SECRET (32+ characters).');
  app.listen(PORT, () => console.log(`The Mexican Cola is running on port ${PORT}`));
}

start();
