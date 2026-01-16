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
ENV SKIP_ENV_VALIDATION=true
ENV NODE_ENV=production

# NEXT_PUBLIC_* variables must be available at build time
# because they are inlined into the client-side JavaScript bundle
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI
ENV NEXT_PUBLIC_WORKOS_REDIRECT_URI=${NEXT_PUBLIC_WORKOS_REDIRECT_URI}

ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Build the application
RUN pnpm run build

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
