import type { LogtoConfig } from '@logto/react'

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT
const appId = import.meta.env.VITE_LOGTO_APP_ID
const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE

if (!endpoint || !appId) {
  throw new Error(
    'Missing Logto configuration: VITE_LOGTO_ENDPOINT and VITE_LOGTO_APP_ID are required',
  )
}

export const logtoConfig: LogtoConfig = {
  endpoint,
  appId,
  resources: apiResource ? [apiResource] : [],
  // The API scope must be requested explicitly or the resource access token
  // comes back with an empty scope and no roles claim (RBAC breaks).
  scopes: ['openid', 'profile', 'email', 'custom_data', 'identities', 'roles', 'use:api'],
}
