# Local PostgreSQL setup (current)

**Phase:** Install and run PostgreSQL **natively on the machine** (Windows).  
**Later:** Move the same database to Docker (`docker-compose.yml` is already in the repo for that step).

Prisma and the app always connect via:

```
DATABASE_URL="postgresql://admin:admin@localhost:5432/oneview?schema=public"
```

Same URL works for local install today and Docker tomorrow (both expose `localhost:5432`).

---

## 1. Install PostgreSQL (Windows)

1. Download the Windows installer from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/) (EDB installer is fine).
2. Install **PostgreSQL 16** (or 15+).
3. During setup:
   - Note the **port** — keep **5432**.
   - Set a password for the default `postgres` superuser (you need this only for initial admin tasks).
   - Install **Command Line Tools** / ensure `psql` is on PATH (or use **SQL Shell (psql)** from the Start menu).
4. Confirm the Windows service is running: **Services** → `postgresql-x64-16` (or similar) → Status = Running.

### Optional: add `psql` to PATH

Typical path:

```
C:\Program Files\PostgreSQL\16\bin
```

Open a **new** PowerShell and check:

```powershell
psql --version
```

---

## 2. Create role, password, and database

Connect as the `postgres` superuser (password from installer):

```powershell
psql -U postgres -h localhost
```

In `psql`, run:

```sql
-- App role (dev only — do not use in production)
CREATE ROLE admin WITH LOGIN PASSWORD 'admin' CREATEDB;

-- Application database
CREATE DATABASE oneview OWNER admin;

-- Connect to oneview and grant schema rights
\c oneview

GRANT ALL ON SCHEMA public TO admin;
ALTER DATABASE oneview OWNER TO admin;
```

Exit:

```sql
\q
```

### Verify login as `admin`

```powershell
psql -U admin -h localhost -d oneview -c "SELECT current_user, current_database();"
```

When prompted, password is **`admin`**.

Expected: `admin` / `oneview`.

---

## 3. Project `.env`

From the repo root:

```powershell
copy .env.example .env
```

Ensure `.env` contains:

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/oneview?schema=public"
VITE_API_BASE_URL=http://localhost:3001/api
```

Do not commit `.env`.

---

## 4. Apply Prisma schema and seed

```powershell
cd D:\Amit\AI\Web\OneView
npm install
npx prisma migrate deploy
npm run db:seed
```

| Command | What it does |
|---------|----------------|
| `npx prisma migrate deploy` | Applies committed migrations (safe for existing local DB) |
| `npm run db:seed` | Loads demo employees, projects, permissions; PIN **`12345`** (hashed) |
| `npm run db:studio` | Opens Prisma Studio to browse tables |
| `npm run db:reset` | **Wipes** DB, re-migrates, re-seeds — use only if you want a clean slate |

### Quick check

```powershell
psql -U admin -h localhost -d oneview -c "SELECT email, is_super_admin FROM employees ORDER BY email LIMIT 5;"
```

You should see `admin@acme.io` and other seeded emails.

---

## 5. Frontend (unchanged)

```powershell
npm run dev
```

UI auth is still mock until the Auth API is wired. The database is ready for PIN verification.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `psql: password authentication failed` | Confirm role `admin` / password `admin`; check `pg_hba.conf` allows `scram-sha-256` or `md5` for localhost |
| `connection refused` on 5432 | Start the PostgreSQL Windows service; confirm port 5432 |
| `database "oneview" does not exist` | Re-run `CREATE DATABASE oneview OWNER admin;` |
| Prisma `P1001` / can't reach server | Service down, wrong port, or firewall |
| Port 5432 already in use | Another Postgres/Docker instance — stop the extra one or change port and update `DATABASE_URL` |
| `permission denied for schema public` | Re-run `GRANT ALL ON SCHEMA public TO admin;` as `postgres` |

---

## Later: move to Docker

When you are ready to switch hosting (same credentials and DB name):

1. Stop the local Windows PostgreSQL service (or free port 5432).
2. From the repo: `npm run db:up` (`docker-compose.yml`).
3. Keep the same `DATABASE_URL`.
4. Run `npx prisma migrate deploy` and `npm run db:seed` again (Docker volume starts empty unless you dump/restore).

Optional dump/restore from local → Docker:

```powershell
# Dump from local
pg_dump -U admin -h localhost -d oneview -F c -f oneview.dump

# After Docker is up
pg_restore -U admin -h localhost -d oneview -c oneview.dump
```

Details for schema and tables: [`database.md`](database.md).
