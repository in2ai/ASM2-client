import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    QUESTDB_HOST: z.string(),
    QUESTDB_PORT: z.coerce.number(),
    QUESTDB_USER: z.string(),
    QUESTDB_PASSWORD: z.string(),
    QUESTDB_DB: z.string(),
    WORKOS_API_KEY: z.string().startsWith("sk_", {
      error:
        "WORKOS_API_KEY must start with 'sk_' (test) or 'sk_live' (production)",
    }),
    WORKOS_CLIENT_ID: z.string().startsWith("client_", {
      error: "WORKOS_CLIENT_ID must start with 'client_'",
    }),
    // Cookie password must be at least 32 characters for secure encryption
    WORKOS_COOKIE_PASSWORD: z.string().min(32, {
      error:
        "WORKOS_COOKIE_PASSWORD must be at least 32 characters. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    }),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z
      .url({
        error: "NEXT_PUBLIC_WORKOS_REDIRECT_URI must be a valid URL",
      })
      .endsWith("/api/auth/callback", {
        error:
          "NEXT_PUBLIC_WORKOS_REDIRECT_URI must end with '/api/auth/callback'",
      }),
    NEXT_PUBLIC_APP_URL: z.url({
      error:
        "NEXT_PUBLIC_APP_URL must be a valid URL (e.g., https://yourdomain.com). For Dokploy: https://${{DOKPLOY_DEPLOY_URL}}",
    }),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    QUESTDB_HOST: process.env.QUESTDB_HOST,
    QUESTDB_PORT: process.env.QUESTDB_PORT,
    QUESTDB_USER: process.env.QUESTDB_USER,
    QUESTDB_PASSWORD: process.env.QUESTDB_PASSWORD,
    QUESTDB_DB: process.env.QUESTDB_DB,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
