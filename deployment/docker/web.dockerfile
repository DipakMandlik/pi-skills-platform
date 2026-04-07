# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./

# Copy source from monorepo layout
COPY apps/web/src ./apps/web/src

RUN npm ci --ignore-scripts
RUN npm run build

# Production stage — serve via nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY deployment/docker/frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
