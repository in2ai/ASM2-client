export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:8001')

export const API_RESOURCE = import.meta.env.VITE_LOGTO_API_RESOURCE

if (!API_RESOURCE) {
  throw new Error('VITE_LOGTO_API_RESOURCE is required for strict API auth')
}