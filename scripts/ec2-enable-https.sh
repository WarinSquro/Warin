#!/usr/bin/env bash
# Enable Let's Encrypt HTTPS for Warin host Nginx (run on EC2 as ubuntu with sudo).
# Usage:
#   export DOMAIN=warin.example.com
#   export EMAIL=admin@example.com   # optional; Certbot registration
#   bash scripts/ec2-enable-https.sh
#
# Requires: DNS A/AAAA for DOMAIN → this instance; SG/UFW allow 80 and 443.
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
APP_ROOT="${APP_ROOT:-/opt/warin/app}"
WEB_ROOT="${WEB_ROOT:-/opt/warin/shared/web}"

if [[ -z "$DOMAIN" ]]; then
  echo "Set DOMAIN to your hostname (Let's Encrypt does not issue certs for bare IPs)."
  echo "  export DOMAIN=warin.example.com"
  exit 1
fi

if [[ ! -d "$APP_ROOT/infra/nginx" ]]; then
  echo "App not found at $APP_ROOT — clone/pull the repo first."
  exit 1
fi

echo "==> Installing certbot (nginx plugin)"
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

echo "==> Ensuring ACME webroot + HTTP site with server_name=$DOMAIN"
sudo mkdir -p /var/www/certbot
sudo sed "s/DOMAIN/${DOMAIN}/g" "$APP_ROOT/infra/nginx/host-http-acme.conf" \
  | sudo tee /etc/nginx/sites-available/warin >/dev/null
sudo ln -sf /etc/nginx/sites-available/warin /etc/nginx/sites-enabled/warin
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

CERTBOT_ARGS=(--nginx -d "$DOMAIN" --agree-tos --redirect --non-interactive)
if [[ -n "$EMAIL" ]]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

echo "==> Requesting certificate (certbot --nginx)"
sudo certbot "${CERTBOT_ARGS[@]}"

echo "==> Enabling certbot.timer (auto-renew)"
sudo systemctl enable --now certbot.timer
sudo systemctl status certbot.timer --no-pager || true

echo "==> Dry-run renewal"
sudo certbot renew --dry-run

echo ""
echo "Done. Next:"
echo "  1. Update /opt/warin/shared/.env:"
echo "       CORS_ORIGIN=https://${DOMAIN}"
echo "       APP_PUBLIC_URL=https://${DOMAIN}"
echo "  2. Recreate API: cd $APP_ROOT && docker compose up -d --force-recreate api"
echo "  3. Rebuild SPA with VITE_API_BASE_URL=https://${DOMAIN}/api/v1 and publish to $WEB_ROOT"
echo "  4. Verify: docs/https-letsencrypt.md"
echo ""
echo "Open: https://${DOMAIN}/"
