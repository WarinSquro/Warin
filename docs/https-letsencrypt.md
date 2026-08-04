# Warin — Free HTTPS with Let's Encrypt

Trusted TLS for the **host Nginx** front door (SPA + `/api` proxy).  
Compose Nginx stays on `127.0.0.1:8080` (HTTP internally); browsers only speak HTTPS to the host.

Related: `infra/nginx/host-http-acme.conf`, `infra/nginx/host-https.conf`, `scripts/ec2-enable-https.sh`, `docs/aws-ec2-deploy-checklist.md`.

---

## Requirement: a real domain name

**Let's Encrypt does not issue certificates for bare public IPs** (e.g. `13.126.64.134`).  
You need a hostname (e.g. `warin.example.com`) with:

| Record | Value |
|--------|--------|
| **A** (IPv4) | EC2 public IPv4 (or Elastic IP) |
| **AAAA** (optional) | EC2 IPv6 if used |

Propagate DNS, then:

```bash
dig +short A your.domain.com
# must show this instance's public IP
```

Until DNS is ready, keep using HTTP via `infra/nginx/host-ip.conf`.

---

## Architecture

```text
Browser ──HTTPS:443──► Host Nginx (Let's Encrypt)
                          ├─ /          → /opt/warin/shared/web  (SPA)
                          └─ /api/      → http://127.0.0.1:8080  (Compose nginx → API)
```

Mixed content is avoided when:

1. The SPA is built with `VITE_API_BASE_URL=https://DOMAIN/api/v1`
2. API `CORS_ORIGIN` and `APP_PUBLIC_URL` use `https://DOMAIN`
3. All assets load from the same `https://DOMAIN` origin (relative `/assets/…`)

---

## One-shot script (recommended)

On EC2 (after `git pull`):

```bash
cd /opt/warin/app
git pull origin main
export DOMAIN=warin.example.com          # your hostname
export EMAIL=you@example.com             # optional but recommended
bash scripts/ec2-enable-https.sh
```

The script:

1. Installs `certbot` + `python3-certbot-nginx`
2. Installs HTTP site with `server_name DOMAIN` + ACME webroot
3. Runs `certbot --nginx` (issues cert, configures TLS, **HTTP → HTTPS redirect**)
4. Enables `certbot.timer` and runs `certbot renew --dry-run`

---

## Manual setup

### 1) Firewall / Security Group

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your IP |
| HTTP | **80** | `0.0.0.0/0` (required for ACME HTTP-01) |
| HTTPS | **443** | `0.0.0.0/0` or your IP |

UFW (if enabled):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 2) HTTP site with correct `server_name`

```bash
cd /opt/warin/app
DOMAIN=warin.example.com
sudo mkdir -p /var/www/certbot
sudo sed "s/DOMAIN/${DOMAIN}/g" infra/nginx/host-http-acme.conf \
  | sudo tee /etc/nginx/sites-available/warin
sudo ln -sf /etc/nginx/sites-available/warin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
curl -sS -o /dev/null -w "%{http_code}\n" "http://${DOMAIN}/"
# expect 200 (SPA) if /opt/warin/shared/web is populated
```

### 3) Install Certbot and obtain certificate

```bash
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

sudo certbot --nginx -d warin.example.com \
  --agree-tos --redirect \
  -m you@example.com
# or: --register-unsafely-without-email
```

Certbot will:

- Write certs under `/etc/letsencrypt/live/<DOMAIN>/`
- Add `listen 443 ssl` and SSL directives to the Nginx site
- Add **HTTP → HTTPS** redirect (because of `--redirect`)

Optional: replace the live site with the repo’s end-state template:

```bash
DOMAIN=warin.example.com
sudo sed "s/DOMAIN/${DOMAIN}/g" infra/nginx/host-https.conf \
  | sudo tee /etc/nginx/sites-available/warin
sudo nginx -t && sudo systemctl reload nginx
```

(Only after certs exist at `/etc/letsencrypt/live/$DOMAIN/`.)

### 4) Point the app at HTTPS (no mixed content)

**`/opt/warin/shared/.env`:**

```bash
CORS_ORIGIN=https://warin.example.com
APP_PUBLIC_URL=https://warin.example.com
```

```bash
cd /opt/warin/app
ln -sfn /opt/warin/shared/.env .env
docker compose up -d --force-recreate api
```

**Rebuild SPA** (prefer laptop on `t3.small` — see credentials doc):

```powershell
# Laptop
$env:VITE_API_BASE_URL="https://warin.example.com/api/v1"
npx vite build
# publish to /opt/warin/shared/web (scp tarball or on-box copy)
```

Hard-refresh the browser on `https://warin.example.com/`.

---

## Automatic renewal

Ubuntu’s Certbot package installs a systemd timer:

```bash
sudo systemctl enable --now certbot.timer
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

Renewal runs twice daily; Nginx is reloaded when certs change (`--nginx` / deploy hooks).

Manual force renew (rarely needed):

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

Certificates are valid ~90 days; auto-renew typically runs at ~30 days remaining.

---

## Verification checklist

Run after HTTPS is live (replace `DOMAIN`):

```bash
DOMAIN=warin.example.com

# 1) HTTP redirects to HTTPS
curl -sSI "http://${DOMAIN}/" | head -20
# expect: HTTP/1.1 301 (or 302) and Location: https://…

# 2) HTTPS SPA
curl -sS -o /dev/null -w "%{http_code}\n" "https://${DOMAIN}/"
# expect: 200

# 3) API health over HTTPS (same origin path)
curl -sS "https://${DOMAIN}/api/v1/health"
# expect: JSON ok

# 4) Certificate
echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -dates -subject

# 5) No mixed content (browser)
#    DevTools → Console: no "Mixed Content" warnings
#    Network: document + assets + XHR all https://DOMAIN
```

Browser checks:

| Check | Pass criteria |
|-------|----------------|
| Padlock | Valid Let’s Encrypt cert for `DOMAIN` |
| `http://DOMAIN` | Redirects to `https://DOMAIN` |
| Login / API | Works; Network shows `https://…/api/v1/…` |
| Static assets | `/assets/*.js` and CSS over HTTPS |
| Swagger (if used) | `https://DOMAIN/api/docs` loads |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Certbot: connection refused / timeout on HTTP-01 | Open SG **80**; DNS must point to this instance |
| Certbot: unauthorized | Wrong `server_name` or another process on :80 |
| Browser: NET::ERR_CERT_* after IP access | Use the **domain** URL, not the bare IP |
| API CORS errors after cutover | Set `CORS_ORIGIN=https://DOMAIN` and recreate API |
| UI calls `http://…` API | Rebuild SPA with `VITE_API_BASE_URL=https://DOMAIN/api/v1` |
| Site blank after HTTPS | Ensure `/opt/warin/shared/web/index.html` exists |

---

## Rollback to HTTP-only (emergency)

```bash
cd /opt/warin/app
sudo cp infra/nginx/host-ip.conf /etc/nginx/sites-available/warin
sudo nginx -t && sudo systemctl reload nginx
# Optionally revert CORS / VITE to http://PUBLIC_IP and republish SPA
```

---

*Let's Encrypt ToS and rate limits apply. Prefer staging (`certbot --staging`) while testing repeatedly.*
