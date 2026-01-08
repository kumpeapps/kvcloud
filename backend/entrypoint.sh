#!/bin/sh
set -e

# SSL certificate directory and file names from environment
SSL_CERT_DIR="${SSL_CERT_DIR:-/etc/ssl/certs/kvcloud}"
SSL_CERT_FILE="${SSL_CERT_FILE:-server.crt}"
SSL_KEY_FILE="${SSL_KEY_FILE:-server.key}"

CERT_PATH="$SSL_CERT_DIR/$SSL_CERT_FILE"
KEY_PATH="$SSL_CERT_DIR/$SSL_KEY_FILE"

echo "KVCloud Backend - Starting with HTTPS support"
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
        2>/dev/null || openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_PATH" \
        -out "$CERT_PATH" \
        -subj "/C=US/ST=State/L=City/O=KVCloud/OU=IT/CN=${SSL_DOMAIN:-localhost}"
    
    # Set permissions
    chmod 600 "$KEY_PATH"
    chmod 644 "$CERT_PATH"
    
    echo "✓ Self-signed SSL certificate generated"
else
    echo "✓ Using existing SSL certificates"
fi

# Start uvicorn with SSL if certificates are present
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
    echo "Starting uvicorn with HTTPS..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio \
        --ssl-keyfile "$KEY_PATH" --ssl-certfile "$CERT_PATH"
else
    echo "Warning: SSL certificates not found, starting without HTTPS"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop asyncio
fi
