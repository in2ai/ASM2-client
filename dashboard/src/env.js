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
    LOGTO_ENDPOINT: z.url({
      error: "LOGTO_ENDPOINT must be a valid URL (e.g., http://logto:3001)",
    }),
    LOGTO_APP_ID: z.string().min(1, {
      error: "LOGTO_APP_ID is required",
    }),
    LOGTO_APP_SECRET: z.string().min(1, {
      error: "LOGTO_APP_SECRET is required",
    }),
    LOGTO_COOKIE_SECRET: z.string().min(32, {
      error:
        "LOGTO_COOKIE_SECRET must be at least 32 characters. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    }),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
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
    LOGTO_ENDPOINT: process.env.LOGTO_ENDPOINT,
    LOGTO_APP_ID: process.env.LOGTO_APP_ID,
    LOGTO_APP_SECRET: process.env.LOGTO_APP_SECRET,
    LOGTO_COOKIE_SECRET: process.env.LOGTO_COOKIE_SECRET,
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
