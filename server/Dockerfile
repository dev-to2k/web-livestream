# Multi-stage build for production-ready Node.js server
# Stage 1: Base image with dependencies
FROM node:18-alpine AS base
WORKDIR /app

# Install system dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Copy package files
COPY package*.json ./

# Stage 2: Development dependencies
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Development image
FROM base AS dev
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Stage 4: Production builder
FROM base AS builder
COPY package*.json ./
RUN npm ci --include=dev
COPY . .

# Stage 5: Production image
FROM node:18-alpine AS production
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install runtime dependencies only
RUN apk add --no-cache curl

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/src ./src

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Set environment variables for production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Start the application
CMD ["node", "index.js"]