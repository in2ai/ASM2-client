/**
 * Rate Limiting Configuration
 *
 * This file contains rate limiting configuration for future implementation.
 * Rate limiting is not currently enforced but the infrastructure is prepared.
 *
 * To enable rate limiting, integrate with a rate limiting library such as:
 * - Upstash Redis (@upstash/ratelimit)
 * - rate-limiter-flexible
 * - express-rate-limit
 */

/**
 * Rate limit configuration for different endpoint types
 */
export const rateLimitConfig = {
  /**
   * General API endpoints
   * Applied to most read operations
   */
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per window
    message: "Too many requests from this IP, please try again later.",
  },

  /**
   * Authentication endpoints
   * Stricter limits to prevent brute force attacks
   */
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 failed attempts
    skipSuccessfulRequests: true,
    message: "Too many authentication attempts, please try again later.",
  },

  /**
   * Data export endpoints
   * Limited to prevent resource exhaustion
   */
  export: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 exports per hour
    message: "Export limit reached. Please try again later.",
  },

  /**
   * Expensive aggregation queries
   * Limited to prevent database overload
   */
  aggregation: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20, // 20 aggregations per 5 minutes
    message: "Too many complex queries. Please try again in a few minutes.",
  },

  /**
   * Admin operations
   * Moderate limits for administrative actions
   */
  admin: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 200, // Higher limit for admins
    message: "Rate limit exceeded. Please try again later.",
  },
} as const;

/**
 * Rate limit keys for different user types
 */
export const getRateLimitKey = (
  userId: string,
  endpoint: keyof typeof rateLimitConfig,
): string => {
  return `ratelimit:${endpoint}:${userId}`;
};

/**
 * Rate limit response headers
 */
export interface RateLimitHeaders {
  "X-RateLimit-Limit": number;
  "X-RateLimit-Remaining": number;
  "X-RateLimit-Reset": number;
  "Retry-After"?: number;
}

/**
 * Create rate limit headers for response
 */
export const createRateLimitHeaders = (
  limit: number,
  remaining: number,
  resetTime: Date,
): RateLimitHeaders => {
  const headers: RateLimitHeaders = {
    "X-RateLimit-Limit": limit,
    "X-RateLimit-Remaining": Math.max(0, remaining),
    "X-RateLimit-Reset": Math.floor(resetTime.getTime() / 1000),
  };

  if (remaining <= 0) {
    headers["Retry-After"] = Math.ceil(
      (resetTime.getTime() - Date.now()) / 1000,
    );
  }

  return headers;
};

/**
 * Example implementation with Upstash Redis
 *
 * Uncomment and configure when ready to enable rate limiting:
 *
 * ```typescript
 * import { Ratelimit } from '@upstash/ratelimit';
 * import { Redis } from '@upstash/redis';
 *
 * const redis = new Redis({
 *   url: process.env.UPSTASH_REDIS_REST_URL!,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 * });
 *
 * export const apiRateLimiter = new Ratelimit({
 *   redis,
 *   limiter: Ratelimit.slidingWindow(
 *     rateLimitConfig.api.maxRequests,
 *     `${rateLimitConfig.api.windowMs}ms`,
 *   ),
 *   analytics: true,
 * });
 *
 * export const authRateLimiter = new Ratelimit({
 *   redis,
 *   limiter: Ratelimit.slidingWindow(
 *     rateLimitConfig.auth.maxRequests,
 *     `${rateLimitConfig.auth.windowMs}ms`,
 *   ),
 *   analytics: true,
 * });
 * ```
 */

/**
 * Example TRPC middleware for rate limiting
 *
 * ```typescript
 * const rateLimitMiddleware = t.middleware(async ({ ctx, next, path }) => {
 *   if (!ctx.userContext) {
 *     return next();
 *   }
 *
 *   const key = getRateLimitKey(ctx.userContext.userId, 'api');
 *   const { success, limit, remaining, reset } = await apiRateLimiter.limit(key);
 *
 *   if (!success) {
 *     throw new TRPCError({
 *       code: 'TOO_MANY_REQUESTS',
 *       message: rateLimitConfig.api.message,
 *     });
 *   }
 *
 *   return next();
 * });
 * ```
 */

/**
 * Example Next.js middleware for rate limiting
 *
 * ```typescript
 * import { NextResponse } from 'next/server';
 * import type { NextRequest } from 'next/server';
 *
 * export async function rateLimitMiddleware(request: NextRequest) {
 *   const ip = request.ip ?? '127.0.0.1';
 *   const key = `ratelimit:api:${ip}`;
 *
 *   const { success, limit, remaining, reset } = await apiRateLimiter.limit(key);
 *
 *   const headers = createRateLimitHeaders(limit, remaining, reset);
 *
 *   if (!success) {
 *     return new NextResponse(
 *       JSON.stringify({ error: rateLimitConfig.api.message }),
 *       {
 *         status: 429,
 *         headers: {
 *           'Content-Type': 'application/json',
 *           ...headers,
 *         },
 *       },
 *     );
 *   }
 *
 *   const response = NextResponse.next();
 *   Object.entries(headers).forEach(([key, value]) => {
 *     response.headers.set(key, String(value));
 *   });
 *
 *   return response;
 * }
 * ```
 */
