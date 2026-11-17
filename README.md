# The Mexican Cola website

The public website, the free tasting form, and the admin side where the founder manages enquiries.
The plan is in [PRD.md](PRD.md).

## What is where

| Path | What it is |
| --- | --- |
| `public/` | The public website: home page (English and Thai), thank you page, photos. |
| `server.js` | The web server: serves the site, saves the form, runs the admin side. |
| `db.js` | The database tables. They are created on start. |
| `auth.js` | The admin login. |
| `views.js` | The admin pages. |
| `.env.example` | The names of the secret settings, with empty values. |

## Pages

- `/` home page. `/#th` opens it in Thai.
- `/thanks` thank you page after the form.
- `/admin` admin side: login, enquiries, counts, search, filters, status, notes, CSV export.
- `/health` shows if the server runs and the database is connected.

## Put it online with Railway

1. Railway builds the app from `package.json` and runs `npm start`.
2. Add a database: **+ New**, then **Database**, then **PostgreSQL**.
3. In your website service, open **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `ADMIN_EMAIL` = the email you log in with
   - `ADMIN_PASSWORD` = a strong password
   - `SESSION_SECRET` = random text, at least 32 characters
   - `NODE_ENV` = `production`
4. Railway redeploys. Open **Settings**, then **Networking**, then **Generate Domain** to get the web address.
5. Test: send the form, then log in at `/admin` and find the enquiry.

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
- The form has a hidden trap field for spam bots, and a limit of 5 sends per visitor per hour.
- The logs never hold names or emails, only the enquiry number.
- The CSV export stops spreadsheet programs from running cell text as formulas.
