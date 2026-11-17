// Database: one Postgres connection pool, and the tables the site needs.
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' text, so a day never shifts with the server's time zone.
types.setTypeParser(1082, (v) => v);

const STATUSES = ['New', 'Contacted', 'Tasting booked', 'Tasted', 'Ordered', 'Lost'];
const CITIES = ['Bangkok', 'Pattaya', 'Hua Hin', 'Koh Samui', 'Phuket', 'Other'];

let pool = null;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool && hasDatabase()) {
    const url = process.env.DATABASE_URL;
    // Railway's private network does not use SSL. Public database URLs do.
    const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
    pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set');
  return p.query(text, params);
}

// Creates the tables if they do not exist yet. Safe to run on every start.
async function migrate() {
  if (!hasDatabase()) return false;
  await query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id             SERIAL PRIMARY KEY,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      name           TEXT NOT NULL,
      email          TEXT NOT NULL,
      current_cola   TEXT NOT NULL DEFAULT '',
      venue          TEXT NOT NULL DEFAULT '',
      phone          TEXT NOT NULL DEFAULT '',
      city           TEXT NOT NULL DEFAULT '',
      preferred_date TEXT NOT NULL DEFAULT '',
      language       TEXT NOT NULL DEFAULT 'en',
      status         TEXT NOT NULL DEFAULT 'New'
    );
    CREATE TABLE IF NOT EXISTS enquiry_notes (
      id          SERIAL PRIMARY KEY,
      enquiry_id  INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      body        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enquiry_status_history (
      id          SERIAL PRIMARY KEY,
      enquiry_id  INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_status TEXT,
      to_status   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id              SERIAL PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries (created_at DESC);
    CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status);

    -- Where the visitor came from (added for the report). Empty = sent before tracking existed.
    ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS source   TEXT NOT NULL DEFAULT '';
    ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS medium   TEXT NOT NULL DEFAULT '';
    ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS campaign TEXT NOT NULL DEFAULT '';
    ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS referrer TEXT NOT NULL DEFAULT '';
  `);
  return true;
}

module.exports = { query, migrate, hasDatabase, STATUSES, CITIES };
