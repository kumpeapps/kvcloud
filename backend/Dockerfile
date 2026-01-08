FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including OpenSSL for SSL certificate generation
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 8000

# Use entrypoint script to handle SSL certificate generation
ENTRYPOINT ["/entrypoint.sh"]
