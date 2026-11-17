// The Mexican Cola website: public pages, the tasting form, and the admin side.
const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const views = require('./views');

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

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// ---------- Health check (Railway can use this) ----------
app.get('/health', (req, res) => res.json({ ok: true, database: db.hasDatabase() }));

// ---------- Public website ----------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));

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
    const { rows } = await db.query(
      `INSERT INTO enquiries (name, email, current_cola, venue, phone, city, preferred_date, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name, email, clean(b.cola, 200), clean(b.venue, 200), clean(b.phone, 60), city, preferred, language],
    );
    await db.query('INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status) VALUES ($1, NULL, $2)', [rows[0].id, 'New']);
    // No personal data in the logs: only the id.
    console.log(`New enquiry saved: #${rows[0].id}`);
    return res.json({ ok: true });
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
admin.get('/login', (req, res) => {
  if (auth.isLoggedIn(req)) return res.redirect(303, '/admin');
  res.send(views.loginPage({ notConfigured: !auth.isConfigured() }));
});

admin.post('/login', auth.sameOrigin, (req, res) => {
  const now = Date.now();
  const fails = (loginFails.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (fails.length >= 10) {
    return res.status(429).send(views.loginPage({ error: 'Too many tries. Wait 15 minutes, then try again.' }));
  }
  const { email = '', password = '' } = req.body || {};
  if (auth.checkLogin(email, password)) {
    loginFails.delete(req.ip);
    auth.setSession(res);
    return res.redirect(303, '/admin');
  }
  fails.push(now);
  loginFails.set(req.ip, fails);
  return res.status(401).send(views.loginPage({
    error: 'Wrong email or password.',
    notConfigured: !auth.isConfigured(),
  }));
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
    const header = ['Date', 'Name', 'Email', 'Phone or LINE', 'Venue', 'City', 'Current cola', 'Preferred tasting', 'Language', 'Status'];
    const lines = [header.map(csvCell).join(',')].concat(rows.map((r) => [
      views.fmtDate(r.created_at), r.name, r.email, r.phone, r.venue, r.city, r.current_cola,
      views.fmtPreferred(r.preferred_date), r.language.toUpperCase(), r.status,
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
    if (await db.migrate()) console.log('Database ready.');
    else console.log('No DATABASE_URL yet: the website runs, but the form cannot save enquiries.');
  } catch (err) {
    console.error('Database setup failed:', err.message);
  }
  if (!auth.isConfigured()) console.log('Admin login is off: set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET (32+ characters).');
  app.listen(PORT, () => console.log(`The Mexican Cola is running on port ${PORT}`));
}

start();
