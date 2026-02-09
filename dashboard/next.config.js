import { config as dotenvConfig } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only load .env file manually in local development when env vars aren't already set.
const isEnvAlreadyLoaded = !!process.env.LOGTO_ENDPOINT;

if (!isEnvAlreadyLoaded && !process.env.SKIP_ENV_VALIDATION) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, "../.env");
  const result = dotenvConfig({ path: envPath });

  if (result.error) {
    console.warn(
      `Failed to load environment variables from ${envPath}`,
      result.error,
    );
  }
}

// Import env.js after dotenvConfig loaded the environment variables
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  reactCompiler: true,
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          // TODO Only enable this after confirming your site works properly over HTTPS
          // {
          //   key: "Strict-Transport-Security",
          //   value: "max-age=63072000; includeSubDomains; preload",
          // },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              // Default: only allow resources from same origin
              "default-src 'self'",

              // Scripts: self + inline (needed for Next.js hydration)
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",

              // Styles: self + inline (needed for styled-components/emotion)
              "style-src 'self' 'unsafe-inline'",

              // Images: self, data URIs, blob URIs, and HTTPS sources
              "img-src 'self' data: blob: https:",

              // Fonts: self and data URIs
              "font-src 'self' data:",

              // API connections: self + Logto endpoints
              "connect-src 'self'",

              // Prevent clickjacking
              "frame-ancestors 'self'",

              // Restrict base URI to prevent base tag hijacking
              "base-uri 'self'",

              // Form submissions: self + Logto authentication endpoints
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default config;
