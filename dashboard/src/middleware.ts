import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// In middleware auth mode, each page is protected by default.
// Exceptions are configured via the `unauthenticatedPaths` option.
export default authkitMiddleware({
  // Only enable debug logging in development
  debug: process.env.NODE_ENV === "development",
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/sign-in",
      "/api/auth/callback",
      "/api/health",
    ],
  },
  // Redirect to original page after sign-in
  signUpPaths: [],
});

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
