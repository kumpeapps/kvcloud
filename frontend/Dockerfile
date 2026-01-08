FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies - esbuild postinstall may fail but packages will still be usable
RUN npm install --loglevel=error || npm install --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npx ng build

# Production stage
FROM nginx:alpine

# Install openssl for certificate generation
RUN apk add --no-cache openssl

# Copy built files to nginx
COPY --from=build /app/dist/kvcloud-frontend /usr/share/nginx/html

# Copy nginx SSL configuration (keep old config as fallback)
COPY nginx-ssl.conf /etc/nginx/conf.d/default.conf

# Copy SSL entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports 80 and 443
EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
