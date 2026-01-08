#!/bin/sh
set -e

SSL_CERT_DIR="${SSL_CERT_DIR:-/etc/ssl/certs/kvcloud}"
SSL_CERT_FILE="${SSL_CERT_FILE:-server.crt}"
SSL_KEY_FILE="${SSL_KEY_FILE:-server.key}"
PROXY_BACKEND="${PROXY_BACKEND:-true}"
DEFAULT_API_URL="${API_URL:-}"
ASSETS_DIR="/app/src/assets"

CERT_PATH="$SSL_CERT_DIR/$SSL_CERT_FILE"
KEY_PATH="$SSL_CERT_DIR/$SSL_KEY_FILE"

# Ensure cert directory exists
mkdir -p "$SSL_CERT_DIR"

# Generate self-signed cert if missing
if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    echo "Dev SSL certs missing, generating self-signed certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_PATH" \
        -out "$CERT_PATH" \
        -subj "/C=US/ST=State/L=City/O=KVCloud/OU=IT/CN=${SSL_DOMAIN:-localhost}" \
        -addext "subjectAltName=DNS:${SSL_DOMAIN:-localhost},DNS:*.${SSL_DOMAIN:-localhost},IP:127.0.0.1" \
        2>/dev/null || echo "Warning: Could not add subjectAltName"
    chmod 600 "$KEY_PATH"
    chmod 644 "$CERT_PATH"
fi

# Derive API URL
if [ -z "$DEFAULT_API_URL" ]; then
    if [ "$PROXY_BACKEND" = "true" ]; then
        DEFAULT_API_URL="/api"
    else
        DEFAULT_API_URL="https://localhost:8000"
    fi
fi

# Ensure assets directory exists
mkdir -p "$ASSETS_DIR"

# Write runtime config for Angular dev server (served from assets)
cat > "$ASSETS_DIR/config.js" <<EOF
window.ENV = window.ENV || {};
window.ENV.API_URL = "$DEFAULT_API_URL";
window.ENV.PROXY_BACKEND = ${PROXY_BACKEND};
EOF

# Start Angular dev server with SSL and proxy config
exec npx ng serve --host 0.0.0.0 --disable-host-check \
  --ssl --ssl-cert "$SSL_CERT_DIR/$SSL_CERT_FILE" --ssl-key "$SSL_CERT_DIR/$SSL_KEY_FILE" \
  --proxy-config proxy.conf.json
