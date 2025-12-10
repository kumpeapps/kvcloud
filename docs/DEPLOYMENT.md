# Production Deployment Guide

This guide covers deploying KVCloud to production environments.

## Prerequisites

- Linux server (Ubuntu 22.04 LTS recommended)
- Docker 20.10+ and Docker Compose 2.0+
- PostgreSQL 14+ (external or containerized)
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)
- Proxmox VE 7.0+ cluster

## Deployment Options

### Option 1: Docker Compose (Recommended)
### Option 2: Kubernetes
### Option 3: Manual Installation

---

## Option 1: Docker Compose Deployment

### Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Create application directory
sudo mkdir -p /opt/kvcloud
cd /opt/kvcloud
```

### Step 2: Clone Repository

```bash
# Clone from GitHub
git clone https://github.com/kumpeapps/kvcloud.git .

# Checkout stable release
git checkout tags/v1.0.0  # Use latest stable version
```

### Step 3: Configure Environment

```bash
# Create production environment file
cp backend/.env.example backend/.env

# Edit environment variables
nano backend/.env
```

**Required Configuration**:

```bash
# Application
APP_NAME=KVCloud
DEBUG=False  # IMPORTANT: Set to False in production
SECRET_KEY=your-very-long-random-secret-key-here  # Generate: openssl rand -hex 32
ENVIRONMENT=production

# Database - PostgreSQL recommended
DATABASE_URL=postgresql+asyncpg://kvcloud:secure_password@postgres:5432/kvcloud

# JWT Authentication
JWT_SECRET_KEY=another-very-long-random-secret-key  # Generate: openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60  # Adjust as needed

# CORS - Add your production domain
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Security
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
```

### Step 4: Configure PostgreSQL

Edit `docker-compose.yml` to set secure database credentials:

```yaml
services:
  postgres:
    environment:
      POSTGRES_USER: kvcloud
      POSTGRES_PASSWORD: your-secure-password  # Change this!
      POSTGRES_DB: kvcloud
```

### Step 5: Build and Start Services

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 6: Create Admin User

```bash
# Access backend container
docker exec -it kvcloud-backend bash

# Run Python shell
python -c "
from app.core.database import engine, Base
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy.orm import Session
import asyncio

async def create_admin():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create admin user
    async with Session(engine) as db:
        admin = User(
            username='admin',
            email='admin@yourdomain.com',
            full_name='System Administrator',
            hashed_password=get_password_hash('your-secure-password'),
            is_superuser=True,
            is_active=True
        )
        db.add(admin)
        await db.commit()
        print('Admin user created successfully')

asyncio.run(create_admin())
"
```

### Step 7: Configure Reverse Proxy (Nginx)

```bash
# Install Nginx
sudo apt install nginx

# Create site configuration
sudo nano /etc/nginx/sites-available/kvcloud
```

**Nginx Configuration**:

```nginx
upstream backend {
    server localhost:8000;
}

upstream frontend {
    server localhost:4200;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support for future features
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # API Documentation
    location /docs {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # SPA fallback
        try_files $uri $uri/ /index.html;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/kvcloud /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 8: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Step 9: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 10: Set Up Monitoring

**Option A: Simple Logging**

```bash
# Configure log rotation
sudo nano /etc/logrotate.d/kvcloud
```

```
/opt/kvcloud/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
```

**Option B: Full Monitoring Stack (Prometheus + Grafana)**

See [MONITORING.md](MONITORING.md) for detailed setup.

---

## Option 2: Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.24+
- kubectl configured
- Helm 3.0+
- Persistent storage provider

### Step 1: Create Namespace

```bash
kubectl create namespace kvcloud
```

### Step 2: Create Secrets

```bash
# Database credentials
kubectl create secret generic postgres-secret \
  --from-literal=username=kvcloud \
  --from-literal=password=your-secure-password \
  -n kvcloud

# Application secrets
kubectl create secret generic app-secret \
  --from-literal=secret-key=$(openssl rand -hex 32) \
  --from-literal=jwt-secret=$(openssl rand -hex 32) \
  -n kvcloud
```

### Step 3: Deploy PostgreSQL

```yaml
# postgres-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: kvcloud
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
---
# postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: kvcloud
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:14-alpine
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: POSTGRES_DB
          value: kvcloud
        ports:
        - containerPort: 5432
        volumeMounts:
        - mountPath: /var/lib/postgresql/data
          name: postgres-storage
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: kvcloud
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

```bash
kubectl apply -f postgres-pvc.yaml
kubectl apply -f postgres-deployment.yaml
```

### Step 4: Deploy Backend

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: kvcloud
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: kumpeapps/kvcloud-backend:latest
        env:
        - name: DATABASE_URL
          value: postgresql+asyncpg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/kvcloud
        - name: SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: app-secret
              key: secret-key
        - name: JWT_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: app-secret
              key: jwt-secret
        - name: DEBUG
          value: "False"
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: kvcloud
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
```

```bash
kubectl apply -f backend-deployment.yaml
```

### Step 5: Deploy Frontend

```yaml
# frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: kvcloud
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: kumpeapps/kvcloud-frontend:latest
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: kvcloud
spec:
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
```

```bash
kubectl apply -f frontend-deployment.yaml
```

### Step 6: Configure Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kvcloud-ingress
  namespace: kvcloud
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - yourdomain.com
    secretName: kvcloud-tls
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

```bash
kubectl apply -f ingress.yaml
```

---

## Post-Deployment Checklist

- [ ] Change default admin password
- [ ] Configure Proxmox cluster connection
- [ ] Test VM creation and operations
- [ ] Set up database backups
- [ ] Configure log aggregation
- [ ] Set up monitoring and alerts
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Review security settings
- [ ] Test disaster recovery procedure
- [ ] Document custom configuration
- [ ] Train administrators

## Backup Strategy

### Database Backup

```bash
# Automated daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups/kvcloud
mkdir -p $BACKUP_DIR

docker exec kvcloud-postgres pg_dump -U kvcloud kvcloud | gzip > $BACKUP_DIR/kvcloud_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "kvcloud_*.sql.gz" -mtime +30 -delete
```

Add to crontab:
```bash
0 2 * * * /opt/kvcloud/backup.sh
```

### Configuration Backup

```bash
# Backup environment and configs
tar -czf kvcloud-config-$(date +%Y%m%d).tar.gz \
  backend/.env \
  docker-compose.yml \
  /etc/nginx/sites-available/kvcloud
```

## Maintenance

### Update Application

```bash
cd /opt/kvcloud

# Pull latest version
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Run migrations
docker exec kvcloud-backend alembic upgrade head
```

### Monitor Application

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Check resource usage
docker stats
```

## Troubleshooting

See main [README.md](../README.md#troubleshooting) for common issues and solutions.

## Support

For production deployment support:
- Email: support@kumpeapps.com
- Enterprise Support: Available for production deployments
- GitHub Issues: For community support
