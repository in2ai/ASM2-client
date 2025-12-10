import { createEnv } from "@t3-oss/env-nextjs";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// Load environment variables from the root .env file (parent directory)
// This allows sharing a single .env file across the monorepo
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    // QuestDB connection configuration
    QUESTDB_HOST: z.string(),
    QUESTDB_PORT: z.coerce.number(),
    QUESTDB_USER: z.string(),
    QUESTDB_PASSWORD: z.string(),
    QUESTDB_DB: z.string(),
    // WorkOS authentication
    WORKOS_API_KEY: z.string(),
    WORKOS_CLIENT_ID: z.string(),
    WORKOS_COOKIE_PASSWORD: z.string(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    // QuestDB connection
    QUESTDB_HOST: process.env.QUESTDB_HOST,
    QUESTDB_PORT: process.env.QUESTDB_PORT,
    QUESTDB_USER: process.env.QUESTDB_USER,
    QUESTDB_PASSWORD: process.env.QUESTDB_PASSWORD,
    QUESTDB_DB: process.env.QUESTDB_DB,
    // WorkOS authentication
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
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
