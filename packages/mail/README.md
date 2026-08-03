# @oneview/mail

Mail facade for product flows (forgot PIN, notifications).

| Provider | Status |
|----------|--------|
| `console` / dryRun | Implemented (logs) |
| `smtp` | Implemented (nodemailer) |
| `bullmq` | Planned |
| `rabbitmq` | Planned |

## Local (Docker Mailpit)

Compose runs [Mailpit](https://github.com/axllent/mailpit) as SMTP catcher:

- SMTP: `mailpit:1025` (from API container) / `127.0.0.1:1025` (host)
- UI inbox: http://127.0.0.1:8025

API env (Compose defaults):

```
MAIL_DRY_RUN=false
MAIL_PROVIDER=smtp
MAIL_SMTP_HOST=mailpit
MAIL_SMTP_PORT=1025
MAIL_FROM=noreply@oneview.local
APP_PUBLIC_URL=http://127.0.0.1:5173
```

## Real SMTP (e.g. Gmail)

```
MAIL_DRY_RUN=false
MAIL_PROVIDER=smtp
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=you@gmail.com
MAIL_SMTP_PASS=app-password
MAIL_FROM=OneView <you@gmail.com>
```

Forgot-PIN only emails **registered employee** addresses. Use Mailpit UI for local testing with `admin@acme.io`.
