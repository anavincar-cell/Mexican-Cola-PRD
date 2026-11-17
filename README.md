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
| `views.js` | The admin pages. |
| `.env.example` | The names of the secret settings, with empty values. |

## Pages

- `/` home page. `/#th` opens it in Thai.
- `/thanks` thank you page after the form.
- `/admin` admin side: login, enquiries, counts, search, filters, status, notes, CSV export.
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
