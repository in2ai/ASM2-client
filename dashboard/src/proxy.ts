import { logtoConfig } from "@/lib/logto";
import { getLogtoContext } from "@logto/next/server-actions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicPaths = [
  "/sign-in",
  "/callback",
  "/api/logto/sign-in",
  "/api/logto/sign-out",
  "/api/locale",
  "/api/health",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check authentication
  const { isAuthenticated } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

// Match against pages that require authentication
// Exclude static files and internal Next.js routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
