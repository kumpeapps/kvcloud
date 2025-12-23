#!/bin/sh

# Generate runtime configuration from environment variables
cat > /usr/share/nginx/html/config.js <<EOF
window.ENV = window.ENV || {};
window.ENV.API_URL = '${API_URL:-http://localhost:8000}';
EOF

echo "Generated runtime config with API_URL=${API_URL:-http://localhost:8000}"

# Start nginx
exec nginx -g "daemon off;"
