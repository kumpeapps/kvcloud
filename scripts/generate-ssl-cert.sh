#!/bin/bash
# Generate self-signed SSL certificate if none exists

CERT_DIR="${SSL_CERT_DIR:-/etc/ssl/certs/kvcloud}"
CERT_FILE="${SSL_CERT_FILE:-server.crt}"
KEY_FILE="${SSL_KEY_FILE:-server.key}"

CERT_PATH="$CERT_DIR/$CERT_FILE"
KEY_PATH="$CERT_DIR/$KEY_FILE"

# Create certificate directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
    echo "SSL certificates already exist at:"
    echo "  Certificate: $CERT_PATH"
    echo "  Key: $KEY_PATH"
    exit 0
fi

echo "Generating self-signed SSL certificate..."
echo "  Certificate: $CERT_PATH"
echo "  Key: $KEY_PATH"

# Generate self-signed certificate valid for 365 days
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_PATH" \
    -out "$CERT_PATH" \
    -subj "/C=US/ST=State/L=City/O=KVCloud/OU=IT/CN=${SSL_DOMAIN:-localhost}" \
    -addext "subjectAltName=DNS:${SSL_DOMAIN:-localhost},DNS:*.${SSL_DOMAIN:-localhost},IP:127.0.0.1"

# Set appropriate permissions
chmod 600 "$KEY_PATH"
chmod 644 "$CERT_PATH"

echo "✓ Self-signed SSL certificate generated successfully"
echo "  Valid for: 365 days"
echo "  Common Name: ${SSL_DOMAIN:-localhost}"
