# Docker deployment

## Quick start

```bash
cp .env.example .env
npm install
npm run packages:build
docker compose up -d --build
# apply schema + seed (from host against published 15432 → container 5432)
npx prisma migrate deploy
npm run db:seed
```

| Service | Port |
|---------|------|
| Nginx → API | http://localhost:8080/api/v1 |
| API direct | http://localhost:3001/api/v1 (if published) |
| Postgres | 15432 (host) → 5432 (container) |
| Redis | 6379 |
| pgAdmin | http://localhost:5050 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 (admin/admin) |
| Loki | 3100 |
| Mailpit (dev inbox) | http://localhost:8025 |
| Mailpit SMTP | 1025 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ Stream | 5552 |
| RabbitMQ Management | http://localhost:15672 (admin/admin) |

### Grafana → RabbitMQ data source

Grafana and RabbitMQ share Compose networks. In **Connections → Data sources → RabbitMQ**:

| Field | Value |
|--------|--------|
| Host | `rabbitmq` (not `localhost` — that is the Grafana container itself) |
| AMQP Port | `5672` |
| Stream Port | `5552` |
| VHost | `/` |
| TLS | Off |
| Username | `admin` |
| Password | `admin` |
| Stream name | `rabbitmq.stream` (or create a stream in the management UI first) |

Do **not** use RabbitMQ’s default `guest`/`guest` from another container — that user is loopback-restricted unless reconfigured. This stack seeds `admin`/`admin`.

API Swagger: http://localhost:8080/api/docs (via nginx) or container `:3001/api/docs`.

## Configuration

See `.env.example`. Never commit production `JWT_SECRET` / `HMAC_PEPPER`.

### Forgot PIN / email (local)

Compose includes **Mailpit** (SMTP catcher). With `MAIL_DRY_RUN=false` and `MAIL_PROVIDER=smtp`, forgot-PIN emails are delivered to Mailpit — open http://127.0.0.1:8025. Use a **registered** employee email (e.g. `admin@acme.io`). Unregistered addresses still show the success screen but send nothing.

For real Gmail/SMTP, set `MAIL_SMTP_HOST` / `MAIL_SMTP_USER` / `MAIL_SMTP_PASS` in `.env` (see `packages/mail/README.md`).

## Backup / restore

```bash
bash scripts/backup-postgres.sh ./backups
bash scripts/restore-postgres.sh ./backups/oneview_YYYYMMDD.dump
```

Volumes: `oneview_pgdata`, `oneview_pgbackups`, `oneview_files`, `oneview_redis`, `oneview_rabbitmq`.
