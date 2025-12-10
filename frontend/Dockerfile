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

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
