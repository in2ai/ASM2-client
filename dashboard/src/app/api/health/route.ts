import { NextResponse } from "next/server";

/**
 * Health check endpoint for monitoring and load balancer health checks
 *
 * Returns 200 OK with basic health information.
 * This endpoint is listed in unauthenticatedPaths to allow access without auth.
 */
export function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
}
