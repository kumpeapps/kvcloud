#!/bin/sh
set -e

# SSL certificate directory and file names from environment
SSL_CERT_DIR="${SSL_CERT_DIR:-/etc/ssl/certs/kvcloud}"
SSL_CERT_FILE="${SSL_CERT_FILE:-server.crt}"
SSL_KEY_FILE="${SSL_KEY_FILE:-server.key}"

CERT_PATH="$SSL_CERT_DIR/$SSL_CERT_FILE"
KEY_PATH="$SSL_CERT_DIR/$SSL_KEY_FILE"

echo "KVCloud Frontend - Starting with HTTPS support"
echo "SSL Configuration:"
echo "  Certificate Directory: $SSL_CERT_DIR"
echo "  Certificate File: $SSL_CERT_FILE"
echo "  Key File: $SSL_KEY_FILE"

# Create certificate directory
mkdir -p "$SSL_CERT_DIR"

# Check if certificates exist
if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    echo "SSL certificates not found, generating self-signed certificate..."
    
    # Generate self-signed certificate
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_PATH" \
        -out "$CERT_PATH" \
        -subj "/C=US/ST=State/L=City/O=KVCloud/OU=IT/CN=${SSL_DOMAIN:-localhost}" \
        -addext "subjectAltName=DNS:${SSL_DOMAIN:-localhost},DNS:*.${SSL_DOMAIN:-localhost},IP:127.0.0.1" \
        2>/dev/null || echo "Warning: Could not add subjectAltName"
    
    # Set permissions
    chmod 600 "$KEY_PATH"
    chmod 644 "$CERT_PATH"
    
    echo "✓ Self-signed SSL certificate generated"
else
    echo "✓ Using existing SSL certificates"
fi

# Update nginx config with correct paths if needed
if [ "$SSL_CERT_FILE" != "server.crt" ] || [ "$SSL_KEY_FILE" != "server.key" ]; then
    sed -i "s|/etc/ssl/certs/kvcloud/server.crt|$CERT_PATH|g" /etc/nginx/conf.d/default.conf
    sed -i "s|/etc/ssl/certs/kvcloud/server.key|$KEY_PATH|g" /etc/nginx/conf.d/default.conf
fi

# Write runtime config.js for the frontend (served from assets)
DEFAULT_API_URL="${API_URL:-}"
if [ -z "$DEFAULT_API_URL" ] && [ "${PROXY_BACKEND:-false}" = "true" ]; then
    DEFAULT_API_URL="/api"
fi
if [ -z "$DEFAULT_API_URL" ]; then
    DEFAULT_API_URL="https://localhost:8000"
fi

ASSETS_DIR="/usr/share/nginx/html/assets"
mkdir -p "$ASSETS_DIR"

cat > "$ASSETS_DIR/config.js" <<EOF
window.ENV = window.ENV || {};
window.ENV.API_URL = "$DEFAULT_API_URL";
window.ENV.PROXY_BACKEND = ${PROXY_BACKEND:-false};
EOF

echo "Starting nginx..."
exec nginx -g 'daemon off;'
