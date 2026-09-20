#!/usr/bin/env bash
# 24 Care — one-shot Ubuntu/Debian VPS setup.
#
# Run as root from a checkout of this repository, or pass --repo-url:
#   sudo ./scripts/setup-vps.sh \
#     --domain 24care.busundo.org \
#     --env-file /root/24care.env \
#     --vertex-credentials /root/vertex-service-account.json \
#     --tls --tls-email ops@example.com
#
# The environment file is copied to /etc/24care/24care.env and is never
# printed. Keep OAuth, Supabase, and Google credentials out of Git.

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFAULT_SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_USER="careapp"
APP_HOME=""
APP_DIR=""
APP_BRANCH="main"
DOMAIN=""
REPO_URL=""
ENV_FILE=""
VERTEX_CREDENTIALS=""
TLS_EMAIL=""
ENABLE_TLS=0
PROXY_MODE="nginx"
CONFIGURE_FIREWALL=1

log() {
  printf '\n[24care] %s\n' "$*"
}

die() {
  printf '\n[24care] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  sudo ./scripts/setup-vps.sh [options]

Required:
  --domain NAME                  Public HTTPS hostname, e.g. 24care.busundo.org
  --env-file PATH                Production env file containing server secrets

Repository:
  --repo-url URL                 Git URL; defaults to the current checkout remote
  --branch NAME                  Git branch (default: main)
  --app-user NAME                Linux service user (default: careapp)
  --app-home PATH                Linux service home (default: /home/<app-user>)
  --app-dir PATH                 Checkout path (default: <app-home>/app)

Gemini ADC:
  --vertex-credentials PATH      Google service-account JSON for Vertex AI ADC
TLS and proxy:
  --cloudflare-tunnel           Skip Nginx/Certbot; Cloudflared proxies localhost
  --tls                          Request a Let's Encrypt certificate with Certbot
  --tls-email EMAIL              Required with --tls
  --no-firewall                  Do not configure UFW
  --help                         Show this help

Example:
  sudo ./scripts/setup-vps.sh \
    --domain 24care.busundo.org \
    --env-file /root/24care.env \
    --vertex-credentials /root/vertex-service-account.json \
    --tls --tls-email ops@example.com
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      [[ $# -ge 2 ]] || die "--domain needs a value"
      DOMAIN="$2"
      shift 2
      ;;
    --env-file)
      [[ $# -ge 2 ]] || die "--env-file needs a value"
      ENV_FILE="$2"
      shift 2
      ;;
    --repo-url)
      [[ $# -ge 2 ]] || die "--repo-url needs a value"
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || die "--branch needs a value"
      APP_BRANCH="$2"
      shift 2
      ;;
    --app-user)
      [[ $# -ge 2 ]] || die "--app-user needs a value"
      APP_USER="$2"
      shift 2
      ;;
    --app-home)
      [[ $# -ge 2 ]] || die "--app-home needs a value"
      APP_HOME="$2"
      shift 2
      ;;
    --app-dir)
      [[ $# -ge 2 ]] || die "--app-dir needs a value"
      APP_DIR="$2"
      shift 2
      ;;
    --vertex-credentials)
      [[ $# -ge 2 ]] || die "--vertex-credentials needs a value"
      VERTEX_CREDENTIALS="$2"
      shift 2
      ;;
    --cloudflare-tunnel)
      PROXY_MODE="cloudflare"
      shift
      ;;
    --tls)
      ENABLE_TLS=1
      shift
      ;;
    --tls-email)
      [[ $# -ge 2 ]] || die "--tls-email needs a value"
      TLS_EMAIL="$2"
      shift 2
      ;;
    --no-firewall)
      CONFIGURE_FIREWALL=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "Unknown option: $1"
      ;;
  esac
done

[[ "$(id -u)" == "0" ]] || die "Run this script as root, for example: sudo $0 ..."
[[ -n "$DOMAIN" ]] || die "--domain is required"
[[ "$PROXY_MODE" == "nginx" || "$PROXY_MODE" == "cloudflare" ]] || die "Unsupported proxy mode"
[[ "$PROXY_MODE" == "nginx" || "$ENABLE_TLS" == "0" ]] || die "--tls cannot be used with --cloudflare-tunnel; Cloudflare terminates TLS"
[[ "$DOMAIN" != *[[:space:]/]* ]] || die "--domain must be a hostname, not a URL or path"
[[ -n "$ENV_FILE" ]] || die "--env-file is required"
[[ -f "$ENV_FILE" ]] || die "Environment file does not exist: $ENV_FILE"
[[ "$ENABLE_TLS" == "0" || -n "$TLS_EMAIL" ]] || die "--tls-email is required with --tls"

APP_HOME="${APP_HOME:-/home/$APP_USER}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
ENV_FILE="$(readlink -f -- "$ENV_FILE")"
if [[ -n "$VERTEX_CREDENTIALS" ]]; then
  [[ -f "$VERTEX_CREDENTIALS" ]] || die "Vertex credentials file does not exist: $VERTEX_CREDENTIALS"
  VERTEX_CREDENTIALS="$(readlink -f -- "$VERTEX_CREDENTIALS")"
fi

if [[ -z "$REPO_URL" ]]; then
  if [[ -d "$DEFAULT_SOURCE_DIR/.git" ]]; then
    REPO_URL="$(git -C "$DEFAULT_SOURCE_DIR" remote get-url origin 2>/dev/null || true)"
  fi
  [[ -n "$REPO_URL" ]] || die "No Git remote found. Pass --repo-url explicitly."
fi

readonly SERVER_DIR="/etc/24care"
readonly SERVER_ENV="$SERVER_DIR/24care.env"
readonly BUN_BIN="$APP_HOME/.bun/bin/bun"
readonly VERTEX_DEST="$SERVER_DIR/vertex-service-account.json"
readonly WEB_UNIT="/etc/systemd/system/24care-web.service"
readonly GATEWAY_UNIT="/etc/systemd/system/24care-gateway.service"
readonly NGINX_SITE="/etc/nginx/sites-available/24care"

log "Installing OS packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
BASE_PACKAGES=(ca-certificates curl git openssl ufw unzip)
if [[ "$PROXY_MODE" == "nginx" ]]; then
  BASE_PACKAGES+=(nginx)
fi
apt-get install -y "${BASE_PACKAGES[@]}"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "Creating service user $APP_USER"
  useradd --create-home --home-dir "$APP_HOME" --shell /bin/bash "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$APP_HOME"

if [[ ! -x "$BUN_BIN" ]]; then
  log "Installing Bun for $APP_USER"
  su - "$APP_USER" -s /bin/bash -c 'curl -fsSL https://bun.sh/install | bash'
fi
[[ -x "$BUN_BIN" ]] || die "Bun installation did not produce $BUN_BIN"

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Cloning application repository"
  install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$(dirname -- "$APP_DIR")"
  su - "$APP_USER" -s /bin/bash -c "
    git clone --branch '$APP_BRANCH' '$REPO_URL' '$APP_DIR'
  "
else
  log "Updating existing application checkout"
  su - "$APP_USER" -s /bin/bash -c "
    set -Eeuo pipefail
    git -C '$APP_DIR' fetch --prune origin
    git -C '$APP_DIR' checkout '$APP_BRANCH'
    git -C '$APP_DIR' pull --ff-only origin '$APP_BRANCH'
  "
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Installing protected production configuration"
install -d -o root -g "$APP_USER" -m 750 "$SERVER_DIR"
install -o "$APP_USER" -g "$APP_USER" -m 600 "$ENV_FILE" "$SERVER_ENV"
sed -i 's/\r$//' "$SERVER_ENV"

upsert_env() {
  local key="$1"
  local value="$2"
  if awk -F= -v wanted="$key" '$1 == wanted { found=1 } END { exit found ? 0 : 1 }' "$SERVER_ENV"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$SERVER_ENV"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$SERVER_ENV"
  fi
}

read_env_value() {
  local key="$1"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$SERVER_ENV"
}

ensure_secret() {
  local key="$1"
  local current
  current="$(read_env_value "$key")"
  if [[ -z "$current" ]]; then
    upsert_env "$key" "$(openssl rand -hex 32)"
  fi
}

# These values are safe to derive from the deployment hostname. Secrets remain
# supplied by --env-file or generated locally on the VPS.
upsert_env NEXT_PUBLIC_APP_URL "https://${DOMAIN}"
upsert_env LIVE_GATEWAY_URL "wss://${DOMAIN}/live"
if [[ -z "$(read_env_value LIVE_GATEWAY_PORT)" ]]; then
  upsert_env LIVE_GATEWAY_PORT "8787"
fi
ensure_secret AUTH_JWT_SECRET
ensure_secret AUTH_REFRESH_SECRET

if [[ -n "$VERTEX_CREDENTIALS" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 "$VERTEX_CREDENTIALS" "$VERTEX_DEST"
  upsert_env GOOGLE_APPLICATION_CREDENTIALS "$VERTEX_DEST"
fi

# Read only the non-secret provider selector for validation. The file is also
# sourced in the build command below so Next.js receives server configuration.
AI_PROVIDER_VALUE="$(read_env_value AI_PROVIDER)"
AI_PROVIDER_VALUE="${AI_PROVIDER_VALUE:-gemini}"
if [[ "$AI_PROVIDER_VALUE" == "gemini" ]]; then
  [[ -n "$(read_env_value GOOGLE_CLOUD_PROJECT)" ]] || die "GOOGLE_CLOUD_PROJECT is missing from $SERVER_ENV"
  ADC_PATH="$(read_env_value GOOGLE_APPLICATION_CREDENTIALS)"
  [[ -n "$ADC_PATH" && -f "$ADC_PATH" ]] || die "Gemini requires a readable GOOGLE_APPLICATION_CREDENTIALS file; pass --vertex-credentials"
fi

log "Installing dependencies and building Next.js"
su - "$APP_USER" -s /bin/bash -c "
  set -Eeuo pipefail
  cd '$APP_DIR'
  set -a
  . '$SERVER_ENV'
  set +a
  '$BUN_BIN' install --frozen-lockfile
  if [[ -f agent/package.json ]]; then
    (cd agent && '$BUN_BIN' install --frozen-lockfile)
  fi
  '$BUN_BIN' run typecheck
  '$BUN_BIN' run build
"

log "Writing systemd services"
cat > "$WEB_UNIT" <<EOF
[Unit]
Description=24 Care Next.js application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$SERVER_ENV
ExecStart=$BUN_BIN run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > "$GATEWAY_UNIT" <<EOF
[Unit]
Description=24 Care Gemini Live gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$SERVER_ENV
ExecStart=$BUN_BIN run voice:dev
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

if [[ "$PROXY_MODE" == "nginx" ]]; then
  log "Writing Nginx reverse proxy"
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 25m;

    location /live {
        proxy_pass http://127.0.0.1:8787/live;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
  ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/24care
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
else
  log "Skipping Nginx and Certbot; Cloudflare Tunnel will proxy localhost:3000"
fi

if [[ "$CONFIGURE_FIREWALL" == "1" ]]; then
  log "Configuring UFW"
  ufw allow OpenSSH >/dev/null
  if [[ "$PROXY_MODE" == "nginx" ]]; then
    ufw allow 'Nginx Full' >/dev/null
  fi
  ufw --force enable >/dev/null
fi

if [[ "$ENABLE_TLS" == "1" ]]; then
  log "Requesting Let's Encrypt certificate"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --email "$TLS_EMAIL" --redirect -d "$DOMAIN"
fi

systemctl daemon-reload
systemctl enable --now 24care-gateway.service
systemctl enable --now 24care-web.service
systemctl restart 24care-gateway.service 24care-web.service

log "Checking local application health"
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" == "20" ]]; then
    journalctl -u 24care-web.service -n 80 --no-pager >&2 || true
    die "Next.js did not become healthy"
  fi
  sleep 2
done

cat <<EOF

24 Care VPS setup complete.

App:       https://$DOMAIN
Live WS:   wss://$DOMAIN/live
Proxy:     $PROXY_MODE
Web unit:  systemctl status 24care-web
AI unit:   systemctl status 24care-gateway
Web logs:  journalctl -u 24care-web -f
AI logs:   journalctl -u 24care-gateway -f
Env file:  $SERVER_ENV

Before signing in, confirm these Google OAuth entries:
  Origin:  https://$DOMAIN
  Redirect: https://$DOMAIN/api/auth/google/callback
EOF

if [[ "$PROXY_MODE" == "cloudflare" ]]; then
  cat <<EOF

The existing Cloudflare Tunnel must route:
  /live -> http://127.0.0.1:8787
  everything else -> http://127.0.0.1:3000

Cloudflare terminates TLS. Port 8787 remains private.
EOF
else
  cat <<EOF

Nginx proxies /live to the private gateway on port 8787.
EOF
fi
