import type { LogtoNextConfig } from "@logto/next";
import { env } from "@/env";

export const logtoConfig: LogtoNextConfig = {
  endpoint: env.LOGTO_ENDPOINT,
  appId: env.LOGTO_APP_ID,
  appSecret: env.LOGTO_APP_SECRET,
  baseUrl: env.NEXT_PUBLIC_APP_URL,
  cookieSecret: env.LOGTO_COOKIE_SECRET,
  cookieSecure: process.env.NODE_ENV === "production",
  scopes: [
    "openid",
    "profile",
    "email",
    "custom_data",
    "identities",
    "urn:logto:scope:organizations",
    "urn:logto:scope:organization_roles",
  ],
  resources: [],
};
