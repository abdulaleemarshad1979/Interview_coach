# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy source files and build client & server bundles
COPY . .
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled bundles from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public 2>/dev/null || true

# Run container as non-root node user for high security
USER node

EXPOSE 3000

# Healthcheck to ensure container auto-healing if app stalls
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "--max-http-header-size=163840", "dist/server.cjs"]
