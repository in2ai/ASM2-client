import type { LogtoConfig } from '@logto/react'

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT
const appId = import.meta.env.VITE_LOGTO_APP_ID
const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE

if (!endpoint || !appId) {
  throw new Error('Missing Logto configuration: VITE_LOGTO_ENDPOINT and VITE_LOGTO_APP_ID are required')
}

export const logtoConfig: LogtoConfig = {
  endpoint,
  appId,
  resources: apiResource ? [apiResource] : [],
  scopes: [
    'openid',
    'profile',
    'email',
    'custom_data',
    'identities',
    'urn:logto:scope:organizations',
    'urn:logto:scope:organization_roles',
    'metrics:read',
    'metrics:export',
  ],
}
