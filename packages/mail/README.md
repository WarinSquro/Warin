# @oneview/mail

Mail facade for product flows (forgot PIN, notifications).

**Runtime source of truth:** Settings → **SMTP Settings** (Postgres `smtp_settings`, password AES-GCM encrypted).  
Env `MAIL_*` remains for Compose/Mailpit defaults during bring-up; product sends require Settings SMTP to be configured.

| Provider | Status |
|----------|--------|
| Settings SMTP (DB) | Implemented (nodemailer) |
| `console` / dryRun | Legacy; product flows require Settings SMTP |
| `bullmq` / `rabbitmq` | Planned |

## Local Mailpit via Settings UI

1. Open **Settings → SMTP Settings**
2. Host `mailpit` (from API container) or `127.0.0.1` (host-run API), Port `1025`, Security **None**, Auth **No**
3. Sender Name / Email as desired → **Save Settings** → **Test SMTP Connection**
4. Inbox: http://127.0.0.1:8025 (SSH tunnel on EC2)

## Encryption

SMTP passwords are stored with `@oneview/security` AES-GCM. Key: `SMTP_ENCRYPTION_KEY` or fallback `HMAC_PEPPER`.
