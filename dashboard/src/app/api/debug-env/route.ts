import { NextResponse } from "next/server";

/**
 * Debug endpoint to verify environment variables at build time.
 * This helps diagnose redirect URI issues in production.
 *
 * DELETE THIS FILE after debugging is complete.
 */
export function GET() {
  return NextResponse.json({
    // This value is baked in at build time
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "NOT_SET",
    // This helps verify what was actually compiled
    builtAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
  });
}
