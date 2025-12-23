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

# Copy built files to nginx
COPY --from=build /app/dist/kvcloud-frontend /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script for runtime configuration
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
