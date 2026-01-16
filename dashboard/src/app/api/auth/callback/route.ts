import { handleAuth } from "@workos-inc/authkit-nextjs";

// Extract the base URL from the redirect URI (without the /api/auth/callback path)
// This is needed because when running in Docker, request.nextUrl uses the internal
// container hostname instead of the public domain
const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "";
const baseURL = redirectUri.replace(/\/api\/auth\/callback$/, "");

export const GET = handleAuth({
  returnPathname: "/",
  // Use baseURL to ensure redirects use the public domain, not the internal container hostname
  baseURL: baseURL || undefined,
});
