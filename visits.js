// Our own visit counter: no cookies, no IP addresses stored.
// Each visitor becomes a code made from (secret + today's date + IP + browser), hashed.
// The code changes every day, so nobody can follow a person over time,
// and without the secret the code cannot be turned back into an IP address.
const crypto = require('crypto');
const db = require('./db');
const { classify } = require('./source');

const BOT = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python|node-fetch|axios|headless|lighthouse|facebookexternalhit|whatsapp|telegram|line-poker|embedly|vercel|railway/i;
const EVENTS = ['cta_click'];
const fallbackSecret = crypto.randomBytes(32).toString('hex');

function bangkokDay(date = new Date()) {
  // YYYY-MM-DD in Thailand time.
  return new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function visitorCode(req, day) {
  const secret = process.env.SESSION_SECRET || fallbackSecret;
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);
  return crypto.createHmac('sha256', secret).update(`${day}|${req.ip}|${ua}`).digest('base64url').slice(0, 22);
}

function device(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'phone';
  return 'computer';
}

function isBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  return !ua || BOT.test(ua);
}

// At most 120 counts per visitor connection per hour, so nobody can inflate the numbers by reloading.
const hits = new Map();
function tooMany(req) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 3600 * 1000);
  recent.push(now);
  hits.set(req.ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 120;
}

async function recordVisit(req) {
  if (!db.hasDatabase() || isBot(req) || tooMany(req)) return false;
  const b = req.body || {};
  const day = bangkokDay();
  const src = classify(typeof b.src === 'object' && b.src ? b.src : {}, req.headers['x-forwarded-host'] || req.headers.host);
  const path = String(b.path || '/').replace(/[^\w/#.-]/g, '').slice(0, 60) || '/';
  await db.query('INSERT INTO visits (day, visitor, path, source, device) VALUES ($1,$2,$3,$4,$5)',
    [day, visitorCode(req, day), path, src.source, device(req)]);
  return true;
}

async function recordEvent(req) {
  const type = (req.body || {}).type;
  if (!db.hasDatabase() || !EVENTS.includes(type) || isBot(req) || tooMany(req)) return false;
  const day = bangkokDay();
  await db.query('INSERT INTO events (day, visitor, type) VALUES ($1,$2,$3)', [day, visitorCode(req, day), type]);
  return true;
}

module.exports = { recordVisit, recordEvent, bangkokDay };
