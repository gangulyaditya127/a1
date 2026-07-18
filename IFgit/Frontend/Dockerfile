# =========================
# 1️⃣ Build stage
# =========================
FROM node:24 AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm i --legacy-peer-deps

# Copy application source
COPY . .

# Build the Vite app
RUN npm run build


# =========================
# 2️⃣ Production stage
# =========================
FROM nginx

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config (for React Router SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy build output from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
