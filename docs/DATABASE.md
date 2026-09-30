# PostgreSQL (athlete_market_app)

Local development database for the Jock Exchange **application**.  
ML / research data belongs in a **separate** database: `athlete_market_ml` (not managed here).

## Current architecture (important)

| Layer | Technology | Role today |
| --- | --- | --- |
| Local API | **PostgreSQL** `athlete_market_app` | Users, holdings, trades, prices, roster, week-stats cache |
| Live site (jockex.dev) | **SQLite** on the EC2 volume | Unchanged until a later deploy. Do not recreate that container from this branch |
| Auth | Email + **bcrypt** password hash + JWT | Preserved as-is (see `backend/src/lib/auth.js`) |

The API requires `DATABASE_URL`. It does not open a SQLite file. `npm run db:import-sqlite -- path/to/jock.db` copies a snapshot into the local database once. ML data stays in `athlete_market_ml`.

## Prerequisites

1. PostgreSQL 14+ installed and running locally (this repo was verified against a local Postgres 18 service on Windows).
2. Ability to create a database (superuser or a role with `CREATEDB`).
3. Node.js + npm (same as the rest of the backend).

Add the Postgres `bin` directory to your `PATH` if `psql` / `createdb` are not found (example Windows path):

`C:\Program Files\PostgreSQL\18\bin`

## 1. Create the local database

Using `psql` as a superuser (replace `postgres` if your admin role differs):

```bash
psql -U postgres -h localhost -c "CREATE DATABASE athlete_market_app;"
```

Or from an interactive `psql` session:

```sql
CREATE DATABASE athlete_market_app;
```

Do **not** create app tables by hand in pgAdmin — use migrations below.

## 2. Configure environment variables

```bash
cd backend
cp .env.example .env   # if you do not already have .env
```

Set your own credentials in `backend/.env` (never commit this file):

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/athlete_market_app
```

URL-encode special characters in the password if needed.

Other existing vars (`JWT_SECRET`, `CURRENTS_API_KEY`, bots, etc.) stay unchanged.

## 3. Install dependencies

```bash
cd backend
npm install
```

## 4. Run migrations

```bash
cd backend
npm run db:migrate
```

From the repo root:

```bash
npm run db:migrate
```

Re-running `db:migrate` is safe: already-applied versions are skipped.

## 5. Verify the connection

```bash
cd backend
npm run db:ping      # SELECT current_database() …
npm run db:status    # applied vs pending migration files
```

## 6. Create a new migration

1. Add a new SQL file under `backend/src/db/pg/migrations/`.
2. Name it with a monotonic prefix, e.g. `002_add_follows.sql` (lexicographic order = apply order).
3. Write plain SQL (`CREATE TABLE`, `ALTER TABLE`, indexes, etc.).
4. Commit the file.
5. Run `npm run db:migrate` locally.
6. Teammates run `npm run db:migrate` after `git pull`.

Do **not** edit an already-applied migration that others may have run; add a new file instead.

## 7. After `git pull`

```bash
cd backend
npm install          # if package-lock changed
npm run db:migrate   # apply any new *.sql migrations
npm run db:status    # confirm pending is empty
```

## 8. Reset / rebuild a LOCAL development database

Destroys all objects in the `public` schema of **`athlete_market_app` only**, then re-applies migrations.

```bash
cd backend
npm run db:reset
```

The reset script refuses to run if `DATABASE_URL` points at a database name other than `athlete_market_app`.

`npm run reset` wipes users, holdings, trades, prices, and chart history in `athlete_market_app`, keeps the roster and week-stat cache, and reseeds prices:

```bash
cd backend
npm run reset
```

## 9. Package scripts

| Script | Purpose |
| --- | --- |
| `npm run db:ping` | Test `DATABASE_URL` |
| `npm run db:migrate` | Apply pending Postgres migrations |
| `npm run db:status` | List applied / pending |
| `npm run db:reset` | Local wipe + remigrate `athlete_market_app` |
| `npm run db:import-sqlite` | Copy a SQLite `jock.db` snapshot into `athlete_market_app` |
| `npm run reset` | Wipe market rows and reseed prices (roster stays) |
| `npm run seed` | Seed prices for roster players that do not have one |

## What is not in this database yet

- Social, contracts/orders book, baskets, notifications
- Anything for `athlete_market_ml` (separate database)
- The live EC2 market. jockex.dev still reads SQLite until that box is switched on purpose

## Auth note

Password hashing stays in the existing Express signup/login path. The Postgres `users` table includes nullable `auth_provider` / `auth_subject` for a future external IdP without inventing a second password system.
