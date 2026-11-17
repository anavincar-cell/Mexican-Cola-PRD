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
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:16px 0}
.count .delta{display:block;margin-top:6px;font:400 14px/1.4 'Work Sans',sans-serif;text-transform:none;letter-spacing:0;color:var(--text-soft)}
.section{margin-top:32px}
.bars{display:grid;grid-template-columns:max-content 1fr max-content;gap:10px 12px;align-items:center}
.bars .name{font-weight:600}.bars .val{font-variant-numeric:tabular-nums;color:var(--text);text-align:right;min-width:72px}
.bars .track{height:20px;background:var(--bg-light);border-radius:4px;overflow:hidden}
.bars .fill{height:100%;background:var(--main);border-radius:0 4px 4px 0;min-width:2px}
.bars .fill.zero{background:transparent}
.chart-wrap{position:relative;overflow-x:auto;-webkit-overflow-scrolling:touch}
.chart svg{display:block;width:100%;min-width:620px;height:auto;overflow:visible}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .axis-label{fill:var(--text-soft);font:12px 'Work Sans',sans-serif}
.chart .bar{fill:var(--main)}
.chart .hit{fill:transparent;cursor:default}
.chart g:hover .bar{fill:#8a1240}
.tip{position:absolute;pointer-events:none;background:var(--bg-dark);color:var(--bg-light);border-radius:8px;padding:6px 10px;font:600 13px 'Work Sans',sans-serif;white-space:nowrap;transform:translate(-50%,-110%);display:none}
details summary{cursor:pointer;font-weight:600;color:var(--main);margin-top:12px}
.linkrow{margin-top:16px}.linkline{display:flex;gap:8px;align-items:center;margin-top:4px}
a.link{flex:1;display:block;background:var(--bg-light);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;word-break:break-all;color:var(--main)}
.explain{color:var(--text-soft);font-size:14px;margin:8px 0 0}
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
${loggedIn ? `<nav class="nav" aria-label="Admin">${link('/admin', 'Enquiries', 'enquiries')}${link('/admin/report', 'Report', 'report')}${link('/admin/users', 'Users', 'users')}${link('/admin/account', 'Change password', 'account')}
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

const SOURCE_NAMES = {
  '': 'Unknown (before tracking)', direct: 'Direct or unknown link', instagram: 'Instagram', facebook: 'Facebook',
  google: 'Google', line: 'LINE', tiktok: 'TikTok', x: 'X (Twitter)', linkedin: 'LinkedIn', search: 'Other search engine',
  email: 'Email', poster: 'Poster or table stand (QR)', 'table-stand': 'Table stand (QR)', 'cold-call': 'Cold call follow-up',
};
function sourceLabel(source) {
  return Object.prototype.hasOwnProperty.call(SOURCE_NAMES, source) ? SOURCE_NAMES[source] : source;
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function fmtDay(d) {
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}
function fmtDayLong(d) {
  const x = new Date(d);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getUTCDay()];
  return `${wd} ${fmtDay(d)}.${x.getUTCFullYear()}`;
}

// A list of horizontal bars: one per row, one colour, the label names each bar.
function barList(rows, total) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<div class="bars" role="list">${rows.map((r) => `
    <span class="name" role="listitem">${esc(r.label)}</span>
    <span class="track" aria-hidden="true"><span class="fill${r.n ? '' : ' zero'}" style="display:block;width:${(r.n / max) * 100}%"></span></span>
    <span class="val">${r.n} <small style="color:var(--text-soft)">(${pct(r.n, total)}%)</small></span>`).join('')}</div>`;
}

// Bar chart of enquiries per day. One series, so no legend: the title names it.
function dayChart(perDay) {
  const W = 900, H = 260, L = 36, R = 8, T = 12, B = 32;
  const max = Math.max(...perDay.map((d) => d.n));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const top = Math.max(step * Math.ceil(Math.max(max, 1) / step), step);
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / perDay.length, gap = 2, bw = slot - gap;
  const y = (v) => T + plotH - (v / top) * plotH;
  let grid = '';
  for (let v = 0; v <= top; v += step) {
    grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const bars = perDay.map((d, i) => {
    const x = L + i * slot + gap / 2;
    const h = (d.n / top) * plotH;
    const r = Math.min(4, h, bw / 2);
    const yTop = y(d.n);
    const base = T + plotH;
    const bar = d.n ? `<path class="bar" d="M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + bw - r} Q${x + bw},${yTop} ${x + bw},${yTop + r} V${base} Z"/>` : '';
    const label = (i % 7 === 0 || i === perDay.length - 1)
      ? `<text class="axis-label" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${fmtDay(d.day)}</text>` : '';
    return `<g>${bar}<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${plotH}" data-tip="${esc(fmtDayLong(d.day))}: ${d.n} ${d.n === 1 ? 'enquiry' : 'enquiries'}"/></g>${label}`;
  }).join('');
  return `<div class="chart-wrap chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of enquiries per day for the last 30 days. The table below has the same numbers.">${grid}${bars}</svg><div class="tip" id="tip"></div></div>
<script>
(function(){var w=document.querySelector('.chart-wrap'),t=document.getElementById('tip');
w.scrollLeft=w.scrollWidth; // On a phone, open at the newest days.
w.querySelectorAll('.hit').forEach(function(h){
  h.addEventListener('mouseenter',function(){t.textContent=h.getAttribute('data-tip');t.style.display='block';});
  h.addEventListener('mousemove',function(e){var b=w.getBoundingClientRect(),half=t.offsetWidth/2,x=Math.min(Math.max(e.clientX-b.left+w.scrollLeft,half),w.scrollWidth-half);t.style.left=x+'px';t.style.top=(e.clientY-b.top)+'px';});
  h.addEventListener('mouseleave',function(){t.style.display='none';});
});})();
</script>
<details><summary>Show as table</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Day</th><th>Enquiries</th></tr></thead><tbody>
${perDay.slice().reverse().map((d) => `<tr><td>${esc(fmtDayLong(d.day))}</td><td>${d.n}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function reportPage({ weeks, byStatus, perDay, sources, siteUrl }) {
  const total = weeks.total;
  const last30 = perDay.reduce((a, d) => a + d.n, 0);
  const change = (now, before) => {
    if (!before) return now ? 'No enquiries in the same days last week' : 'Same as last week';
    const p = Math.round(((now - before) / before) * 100);
    return `${p > 0 ? '+' : ''}${p}% vs the same days last week (${before})`;
  };
  const dayCount = Math.round((new Date(weeks.today) - new Date(weeks.week_start)) / 86400000) + 1;
  const statusRows = byStatus.map((r) => ({ label: r.status, n: r.n }));
  const sourceRows = sources.map((r) => ({ label: sourceLabel(r.source), n: r.n }));
  const links = [
    ['Instagram bio', 'instagram', 'bio'], ['Instagram post or story', 'instagram', 'post'], ['LINE message', 'line', 'chat'],
    ['Poster or table stand (as a QR code)', 'poster', 'qr'], ['Email signature or email', 'email', 'email'], ['After a cold call', 'cold-call', 'call'],
  ];
  const body = `
<h1>Report</h1>
<p>How the landing page is doing. All numbers come live from the enquiries database. Times are Thailand time. A week runs Monday to Sunday.</p>

<section class="section"><h2>1. Enquiries this week and last week</h2>
<div class="tiles">
  <div class="count"><b>${weeks.this_week}</b><span>This week so far</span><span class="delta">${esc(fmtDay(weeks.week_start))} to ${esc(fmtDay(weeks.today))}, ${dayCount} ${dayCount === 1 ? 'day' : 'days'}. ${esc(change(weeks.this_week, weeks.last_week_same_days))}</span></div>
  <div class="count"><b>${weeks.last_week}</b><span>Last week</span><span class="delta">Monday to Sunday, the full week</span></div>
  <div class="count"><b>${last30}</b><span>Last 30 days</span><span class="delta">The sum of the chart below</span></div>
  <div class="count"><b>${total}</b><span>All time</span><span class="delta">Every enquiry ever saved</span></div>
</div>
<p class="explain">"This week so far" is compared with the same weekdays of last week, so a half-finished week is not compared with a full one.</p></section>

<section class="section"><h2>2. Enquiries by status</h2>
<div class="card">${barList(statusRows, total)}
<p class="explain">Each enquiry is counted once, at the status it has now. Percentages are of all ${total} enquiries. In your process: "Tasting booked" is the call booked, "Ordered" is won.</p></div></section>

<section class="section"><h2>3. Enquiries per day, last 30 days</h2>
<div class="card">${dayChart(perDay)}</div></section>

<section class="section"><h2>4. Where people came from</h2>
<div class="card">${sourceRows.length ? barList(sourceRows, total) : '<p>No enquiries yet.</p>'}
<p class="explain">From the link the visitor used (for example <code>?utm_source=instagram</code>). Without a tagged link, the site that sent them (for example Google). "Direct or unknown link" means they typed the address, used a link without a tag, or their app hid where they came from. "Unknown (before tracking)" are enquiries sent before this report existed.</p></div>
<div class="card"><h3>Use these links so the report knows the source</h3>
<p class="explain" style="margin-top:0">Share the matching link in each place. Every visit through it is counted under that source.</p>
${links.map(([label, src, med]) => {
    const url = `${siteUrl}/?utm_source=${src}&utm_medium=${med}`;
    return `<div class="linkrow"><b>${esc(label)}</b>
  <div class="linkline"><a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
  <button class="btn small second copy" type="button" data-url="${esc(url)}">Copy</button></div></div>`;
  }).join('')}
<p class="explain">Clicking a link opens your website as a visitor from that place. If you send the form from it, that test enquiry counts under that source.</p>
</div></section>
<script>
document.querySelectorAll('.copy').forEach(function(b){
  b.addEventListener('click',function(){
    var u=b.getAttribute('data-url');
    function done(){ b.textContent='Copied'; setTimeout(function(){ b.textContent='Copy'; },1500); }
    if(navigator.clipboard&&window.isSecureContext){ navigator.clipboard.writeText(u).then(done,function(){ prompt('Copy this link:',u); }); }
    else { prompt('Copy this link:',u); }
  });
});
</script>`;
  return layout('Report', body, { loggedIn: true, active: 'report' });
}

module.exports = { reportPage, sourceLabel, usersPage, accountPage, loginPage, listPage, detailPage, notFoundPage, fmtDate, fmtPreferred };
