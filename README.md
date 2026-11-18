# The Mexican Cola website

The public website, the free tasting form, and the admin side where the founder manages enquiries.
The plan is in [PRD.md](PRD.md).

## What is where

| Path | What it is |
| --- | --- |
| `public/` | The public website: home page (English and Thai), thank you page, photos. |
| `server.js` | The web server: serves the site, saves the form, runs the admin side. |
| `db.js` | The database tables. They are created on start. |
| `auth.js` | The admin login: admin users, hashed passwords, sessions. |
| `views.js` | The admin pages, including the report and its chart. |
| `source.js` | Works out where a visitor came from, for the report. |
| `mailer.js` | Sends the thank-you email and the new-enquiry alert through Mailgun. |
| `visits.js` | Our own visit counter and button-click counter (no cookies). |
| `public/track.js` | In the browser: cookie banner, Google Analytics, visit and click counting, "ignore me". |
| `.env.example` | The names of the secret settings, with empty values. |

## Pages

- `/` home page. `/#th` opens it in Thai.
- `/thanks` thank you page after the form.
- `/admin` admin side: login, enquiries, counts, search, filters, status, notes, CSV export.
- `/admin/report` report: enquiries this week and last week, by status, per day (chart), and by source.
- `/admin/users` add or remove admin users.
- `/admin/account` change your own password.
- `/health` shows if the server runs and the database is connected.

## Put it online with Railway

1. Railway builds the app from `package.json` and runs `npm start`.
2. Add a database: **+ New**, then **Database**, then **PostgreSQL**.
3. In your website service, open **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `ADMIN_EMAIL` = the email of the first admin
   - `ADMIN_PASSWORD` = the first admin's password, at least 12 characters (only needed once)
   - `SESSION_SECRET` = random text, at least 32 characters
   - `NODE_ENV` = `production`
4. Railway redeploys. Open **Settings**, then **Networking**, then **Generate Domain** to get the web address.
5. Test: send the form, then log in at `/admin` and find the enquiry.
6. **Delete `ADMIN_PASSWORD` from Railway Variables.** The password now lives only as a hash in the database.

## Admin users and passwords

- Admin users are stored in the `admin_users` table. Passwords are stored as scrypt hashes, never as plain text, and never in the code.
- On the first start, the app creates the first admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. After that it ignores `ADMIN_PASSWORD`.
- Add or remove admins at `/admin/users`. You cannot remove yourself.
- Change your password at `/admin/account`. This logs you out on your other devices.
- Forgot your password: set `ADMIN_PASSWORD` to a new one and `ADMIN_RESET_PASSWORD` to `true`, redeploy, log in, then delete both variables.

## The report and where visitors come from

The report at `/admin/report` reads live from the database. Times are Thailand time, and a week runs Monday to Sunday.

The form saves where each visitor came from:

1. A tagged link: `?utm_source=instagram&utm_medium=bio` (or the short `?ref=instagram`).
2. Without a tag: the site that sent them, for example Google. Only the site name is saved, never the full address.
3. Neither: "Direct or unknown link".

Enquiries sent before tracking existed show as "Unknown (before tracking)". The report page lists ready-made links for Instagram, LINE, posters, email and cold calls.

## Visitors and conversion

Two ways of measuring, side by side:

1. **Our own counter** (for the admin report). No cookies and no IP addresses are stored. Each visitor becomes a code made from a secret, the date, the IP and the browser. The code changes every day. Bots are not counted. It counts every visit and every click on **Book a free tasting**.
2. **Google Analytics 4** (for detail). It loads **only after the visitor clicks Accept** in the cookie banner. Events: `cta_click` (main button) and `generate_lead` (form sent). Set `GA_MEASUREMENT_ID` in Railway. Visitors change their choice under "Cookie settings" in the footer.

The report's first block shows visitors, enquiries and the **conversion rate = enquiries ÷ visitors**. It covers this week, last week and the last 30 days, plus the click rate, visitors per day, and phone versus laptop. Only enquiries sent since counting started go into the rate.

**Don't count yourself:** logging in to `/admin` marks that browser as ignored. Open `/?ignore=1` once on your phone to ignore it too, and `/?ignore=0` to undo it. The report page has a switch.

## Emails (Mailgun)

When the form is saved, two emails go out through Mailgun:

1. **A thank-you to the visitor**, in English or Thai: thanks, what happens next, and that we reply within 1 working day.
2. **An alert to you** (`NOTIFY_EMAIL`, else `ADMIN_EMAIL`), with all the details and a link to the enquiry.

Set in Railway Variables: `MAILGUN_API_KEY` (secret), `MAILGUN_DOMAIN` and `MAILGUN_REGION` (`eu` or `us`).

- The emails are sent after the enquiry is saved. If Mailgun fails or is slow, the enquiry stays saved and the visitor sees no error.
- The result (sent, failed or off) shows on each enquiry in the admin.
- On the free sandbox domain, Mailgun only sends to up to 5 authorized recipients that confirmed by email. Add them in Mailgun, under **Sending** → **Domains** → your sandbox domain.

## Run it on your laptop

You need Node.js 20 or newer, and a Postgres database.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` first. Then open http://localhost:3000.

## Safety

- Secrets live only in `.env.local` and in Railway Variables. Never in GitHub.
- Every admin page needs a login. Admin pages are hidden from search engines.
- Passwords are hashed with scrypt. Login is limited to 10 wrong tries per 15 minutes.
- The form has a hidden trap field for spam bots, and a limit of 5 sends per visitor per hour.
- The logs never hold names or emails, only the enquiry number.
- The CSV export stops spreadsheet programs from running cell text as formulas.
