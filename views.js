// HTML for the admin pages, in the brand colours and fonts from the Brand guide.
const { STATUSES, CITIES } = require('./db');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Dates as DD.MM.YYYY HH:MM, in Thailand time.
function fmtDate(d) {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(d));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

function fmtPreferred(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(v || '');
  if (!m) return esc(v);
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? ' ' + m[4] : ''}`;
}

const CSS = `
:root{--main:#B0174F;--accent:#FFB400;--bg-light:#FFF7EC;--bg-dark:#1B1236;--text:#1B1236;--text-soft:#5E5873;--line:#EADFD3}
*{box-sizing:border-box}
body{margin:0;font-family:'Work Sans',system-ui,sans-serif;font-size:16px;line-height:1.5;color:var(--text);background:var(--bg-light)}
h1,h2,h3{font-family:'Bricolage Grotesque',system-ui,sans-serif;margin:0 0 8px;line-height:1.15}
h1{font-size:32px;font-weight:800}h2{font-size:24px;font-weight:700}h3{font-size:18px;font-weight:600}
a{color:var(--main)}
.top{background:var(--bg-dark);color:var(--bg-light);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.top img{height:36px}.top form{margin:0}
.nav{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px}
.nav a{color:var(--bg-light);font-weight:600;text-decoration:none;padding:8px 0;border-bottom:2px solid transparent}
.nav a[aria-current]{border-bottom-color:var(--accent)}
.hint{color:var(--text-soft);font-size:14px;margin:4px 0 0}
.wrap{max-width:1200px;margin:0 auto;padding:24px}
.btn{display:inline-block;background:var(--main);color:var(--bg-light);border:0;border-radius:12px;padding:12px 20px;font:600 16px 'Work Sans',sans-serif;cursor:pointer;text-decoration:none;min-height:44px}
.btn.second{background:var(--bg-light);color:var(--main);border:2px solid var(--main)}
.btn.small{padding:8px 14px;font-size:14px;min-height:36px}
.btn:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:16px 0 24px}
.count{background:#fff;border:1px solid var(--line);border-radius:24px;padding:20px}
.count b{display:block;font:800 40px 'Bricolage Grotesque',sans-serif;color:var(--main)}
.count span{font:600 12px 'Work Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--text-soft)}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:16px}
label{display:block;font:600 12px 'Work Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
input,select,textarea{font:16px 'Work Sans',sans-serif;background:var(--bg-light);border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--text);min-height:44px;width:100%}
.filters>div{min-width:180px;flex:1}
.table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:24px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap}
th{font:600 12px 'Work Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--text-soft)}
tr:last-child td{border-bottom:0}
td.wrap-cell{white-space:normal;min-width:160px}
.tag{display:inline-block;background:var(--accent);color:var(--text);font:600 12px 'Work Sans',sans-serif;border-radius:4px;padding:2px 8px}
.tag.New{background:var(--main);color:var(--bg-light)}
.tag.Lost{background:var(--line);color:var(--text-soft)}
.card{background:#fff;border:1px solid var(--line);border-radius:24px;padding:24px;margin-bottom:16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0}
dt{font:600 12px 'Work Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--text-soft);padding-top:3px}
dd{margin:0;word-break:break-word}
ul.log{list-style:none;padding:0;margin:0}ul.log li{border-left:4px solid var(--main);padding:4px 12px;margin-bottom:12px}
ul.log small{color:var(--text-soft)}
.msg{background:var(--bg-dark);color:var(--bg-light);border-radius:12px;padding:12px 16px;margin-bottom:16px}
.error{color:var(--main);font-weight:600}
.login{max-width:420px;margin:64px auto;background:#fff;border:1px solid var(--line);border-radius:24px;padding:32px}
.login form>div{margin-bottom:16px}
.empty{padding:32px;text-align:center;color:var(--text-soft)}
@media (max-width:760px){.grid2{grid-template-columns:1fr}.wrap{padding:16px}h1{font-size:26px}}
`;

function layout(title, body, { loggedIn = false, active = '' } = {}) {
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · The Mexican Cola admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Work+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body>
<header class="top"><a href="/admin"><img src="/logo.png" alt="The Mexican Cola admin"></a>
${loggedIn ? `<nav class="nav" aria-label="Admin">${link('/admin', 'Enquiries', 'enquiries')}${link('/admin/users', 'Users', 'users')}${link('/admin/account', 'Change password', 'account')}
<form method="post" action="/admin/logout"><button class="btn small second" type="submit">Log out</button></form></nav>` : ''}
</header>
<main class="wrap">${body}</main>
</body></html>`;
}

function loginPage({ error = '', notConfigured = false } = {}) {
  const body = `
<div class="login">
  <h1>Admin login</h1>
  ${notConfigured ? '<p class="error">Login is not set up yet. It needs the database (DATABASE_URL) and SESSION_SECRET in Railway Variables. The first admin comes from ADMIN_EMAIL and ADMIN_PASSWORD.</p>' : ''}
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login">
    <div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
    <div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn" type="submit">Log in</button>
  </form>
</div>`;
  return layout('Log in', body);
}

function options(list, selected, emptyLabel) {
  return `<option value="">${esc(emptyLabel)}</option>` +
    list.map((v) => `<option${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function listPage({ rows, counts, filters, dbReady }) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const table = rows.length === 0
    ? '<div class="empty">No enquiries match. When a venue fills in the form, it shows up here.</div>'
    : `<table><thead><tr>
        <th>Date</th><th>Name</th><th>Venue</th><th>City</th><th>Email</th><th>Phone or LINE</th>
        <th>Current cola</th><th>Preferred tasting</th><th>Lang</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td><a href="/admin/enquiries/${r.id}">${fmtDate(r.created_at)}</a></td>
        <td><a href="/admin/enquiries/${r.id}">${esc(r.name)}</a></td>
        <td class="wrap-cell">${esc(r.venue)}</td><td>${esc(r.city)}</td>
        <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td><td>${esc(r.phone)}</td>
        <td class="wrap-cell">${esc(r.current_cola)}</td><td>${fmtPreferred(r.preferred_date)}</td>
        <td>${esc(r.language.toUpperCase())}</td><td><span class="tag ${esc(r.status.replace(/\s/g, ''))}">${esc(r.status)}</span></td>
      </tr>`).join('')}
      </tbody></table>`;

  const body = `
<h1>Enquiries</h1>
${dbReady ? '' : '<p class="msg">The database is not connected yet. Add a PostgreSQL database in Railway and link DATABASE_URL to this service.</p>'}
<div class="counts">
  <div class="count"><b>${counts.newThisWeek}</b><span>New this week</span></div>
  <div class="count"><b>${counts.tastingsBooked}</b><span>Tastings booked</span></div>
  <div class="count"><b>${counts.orders}</b><span>Orders</span></div>
  <div class="count"><b>${counts.total}</b><span>All enquiries</span></div>
</div>
<form class="filters" method="get" action="/admin">
  <div><label for="q">Search</label><input id="q" name="q" value="${esc(filters.q)}" placeholder="Name, venue or email"></div>
  <div><label for="status">Status</label><select id="status" name="status">${options(STATUSES, filters.status, 'All statuses')}</select></div>
  <div><label for="city">City</label><select id="city" name="city">${options(CITIES, filters.city, 'All cities')}</select></div>
  <div style="flex:0;min-width:auto"><button class="btn" type="submit">Filter</button></div>
  <div style="flex:0;min-width:auto"><a class="btn second" href="/admin">Clear</a></div>
  <div style="flex:0;min-width:auto"><a class="btn second" href="/admin/export.csv${qs ? '?' + esc(qs) : ''}">Export CSV</a></div>
</form>
<p style="color:var(--text-soft);margin:0 0 8px">${rows.length} shown, newest first.</p>
<div class="table-wrap">${table}</div>`;
  return layout('Enquiries', body, { loggedIn: true, active: 'enquiries' });
}

function detailPage({ e, notes, history, flash }) {
  const body = `
<p><a href="/admin">&larr; All enquiries</a></p>
${flash ? `<p class="msg" role="status">${esc(flash)}</p>` : ''}
<h1>${esc(e.name)} <span class="tag ${esc(e.status.replace(/\s/g, ''))}">${esc(e.status)}</span></h1>
<p style="color:var(--text-soft)">Received ${fmtDate(e.created_at)}</p>
<div class="grid2">
  <div class="card"><h2>Details</h2><dl>
    <dt>Name</dt><dd>${esc(e.name)}</dd>
    <dt>Email</dt><dd><a href="mailto:${esc(e.email)}">${esc(e.email)}</a></dd>
    <dt>Phone or LINE</dt><dd>${esc(e.phone) || '–'}</dd>
    <dt>Venue</dt><dd>${esc(e.venue) || '–'}</dd>
    <dt>City</dt><dd>${esc(e.city) || '–'}</dd>
    <dt>Current cola</dt><dd>${esc(e.current_cola) || '–'}</dd>
    <dt>Preferred tasting</dt><dd>${fmtPreferred(e.preferred_date) || '–'}</dd>
    <dt>Language</dt><dd>${esc(e.language.toUpperCase())}</dd>
  </dl></div>
  <div class="card"><h2>Status</h2>
    <form method="post" action="/admin/enquiries/${e.id}/status">
      <label for="new-status">Change status</label>
      <select id="new-status" name="status">${STATUSES.map((s) => `<option${s === e.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <p><button class="btn" type="submit">Save status</button></p>
    </form>
    <h3>History</h3>
    <ul class="log">${history.map((h) => `<li>${h.from_status ? esc(h.from_status) + ' &rarr; ' : ''}${esc(h.to_status)}<br><small>${fmtDate(h.changed_at)}</small></li>`).join('')}</ul>
  </div>
</div>
<div class="card"><h2>Notes</h2>
  <form method="post" action="/admin/enquiries/${e.id}/notes">
    <label for="note">Add a note</label>
    <textarea id="note" name="body" rows="3" maxlength="2000" required placeholder="For example: Tasting 20.11.2026, 15:00, bring 6 bottles"></textarea>
    <p><button class="btn" type="submit">Add note</button></p>
  </form>
  <ul class="log">${notes.length ? notes.map((n) => `<li>${esc(n.body).replace(/\n/g, '<br>')}<br><small>${fmtDate(n.created_at)}</small></li>`).join('') : '<li>No notes yet.</li>'}</ul>
</div>`;
  return layout(e.name, body, { loggedIn: true, active: 'enquiries' });
}

function notFoundPage() {
  return layout('Not found', '<h1>Not found</h1><p><a href="/admin">Back to all enquiries</a></p>', { loggedIn: true });
}

function usersPage({ users, me, flash = '', error = '', emailValue = '' }) {
  const body = `
<h1>Admin users</h1>
<p>Everyone here can log in at /admin and see every enquiry. Passwords are stored hashed, so nobody can read them back, not even you.</p>
${flash ? `<p class="msg" role="status">${esc(flash)}</p>` : ''}
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
<div class="table-wrap" style="margin-bottom:24px"><table><thead><tr><th>Email</th><th>Added</th><th>Last login</th><th></th></tr></thead><tbody>
${users.map((u) => `<tr><td>${esc(u.email)}${u.id === me.id ? ' <span class="tag">You</span>' : ''}</td>
<td>${fmtDate(u.created_at)}</td><td>${u.last_login_at ? fmtDate(u.last_login_at) : 'Never'}</td>
<td>${u.id === me.id ? '' : `<form method="post" action="/admin/users/${u.id}/remove" onsubmit="return confirm('Remove this admin user? They can no longer log in.')"><button class="btn small second" type="submit">Remove</button></form>`}</td></tr>`).join('')}
</tbody></table></div>
<div class="card" style="max-width:560px"><h2>Add an admin user</h2>
<form method="post" action="/admin/users">
  <p><label for="u-email">Email</label><input id="u-email" name="email" type="email" autocomplete="off" required value="${esc(emailValue)}"></p>
  <p><label for="u-pass">Password</label><input id="u-pass" name="password" type="password" autocomplete="new-password" minlength="12" required>
  <span class="hint">At least 12 characters. Give it to the person in a safe way, not by email or chat.</span></p>
  <p><label for="u-confirm">Password again</label><input id="u-confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" required></p>
  <button class="btn" type="submit">Add admin user</button>
</form></div>`;
  return layout('Users', body, { loggedIn: true, active: 'users' });
}

function accountPage({ me, flash = '', error = '' }) {
  const body = `
<h1>Change password</h1>
<p>Logged in as <b>${esc(me.email)}</b>. Changing your password logs you out on all other devices.</p>
${flash ? `<p class="msg" role="status">${esc(flash)}</p>` : ''}
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
<div class="card" style="max-width:560px">
<form method="post" action="/admin/account/password">
  <p><label for="a-current">Current password</label><input id="a-current" name="current" type="password" autocomplete="current-password" required></p>
  <p><label for="a-new">New password</label><input id="a-new" name="password" type="password" autocomplete="new-password" minlength="12" required>
  <span class="hint">At least 12 characters. A password manager can make one for you.</span></p>
  <p><label for="a-confirm">New password again</label><input id="a-confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" required></p>
  <button class="btn" type="submit">Change password</button>
</form></div>`;
  return layout('Change password', body, { loggedIn: true, active: 'account' });
}

module.exports = { usersPage, accountPage, loginPage, listPage, detailPage, notFoundPage, fmtDate, fmtPreferred };
