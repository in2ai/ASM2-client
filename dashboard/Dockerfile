# ============================================
# Base stage: Node.js with pnpm enabled
# ============================================
FROM node:24-alpine AS base

# Enable corepack for pnpm support
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

# Set working directory
WORKDIR /app

# ============================================
# Dependencies stage: Install node_modules
# ============================================
FROM base AS deps

# Install libc6-compat for Alpine compatibility (needed by some packages)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with frozen lockfile for reproducibility
RUN pnpm install --frozen-lockfile

# ============================================
# Builder stage: Build the Next.js application
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time environment variables (non-sensitive)
# NEXT_PUBLIC_* vars are inlined into the client JS bundle at build time
ARG NEXT_PUBLIC_APP_URL
ARG LOGTO_ENDPOINT
ARG LOGTO_APP_ID
ARG QUESTDB_HOST
ARG QUESTDB_PORT
ARG QUESTDB_USER
ARG QUESTDB_DB

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV LOGTO_ENDPOINT=${LOGTO_ENDPOINT}
ENV LOGTO_APP_ID=${LOGTO_APP_ID}
ENV QUESTDB_HOST=${QUESTDB_HOST}
ENV QUESTDB_PORT=${QUESTDB_PORT}
ENV QUESTDB_USER=${QUESTDB_USER}
ENV QUESTDB_DB=${QUESTDB_DB}

# Build the application using BuildKit secret mounts
# SECURITY: Secrets are mounted as files during build only - they are NOT
# persisted in image layers. After this RUN command completes, the secrets
# are no longer accessible in the image.
#
# Requires: DOCKER_BUILDKIT=1 (enabled by default in Docker 23.0+)
# Secrets are passed via docker build --secret or docker-compose secrets
RUN --mount=type=secret,id=LOGTO_APP_SECRET \
    --mount=type=secret,id=LOGTO_COOKIE_SECRET \
    --mount=type=secret,id=QUESTDB_PASSWORD \
    LOGTO_APP_SECRET=$(cat /run/secrets/LOGTO_APP_SECRET) \
    LOGTO_COOKIE_SECRET=$(cat /run/secrets/LOGTO_COOKIE_SECRET) \
    QUESTDB_PASSWORD=$(cat /run/secrets/QUESTDB_PASSWORD) \
    pnpm run build

# ============================================
# Runner stage: Production image
# ============================================
FROM base AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone build output
# Set proper ownership for the nextjs user
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
