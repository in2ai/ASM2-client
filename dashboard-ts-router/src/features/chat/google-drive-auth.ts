const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export const GOOGLE_DRIVE_CALLBACK_PATH = '/chat/provider-callback'

const GOOGLE_DRIVE_RETURN_TO_KEY = 'chat:providerReturnTo'
const GOOGLE_DRIVE_STATE_KEY = 'chat:driveOAuthState'
const GOOGLE_DRIVE_REDIRECT_URI_KEY = 'chat:driveRedirectUri'

interface BuildGoogleDriveAuthorizeUrlInput {
  clientId: string
  redirectUri: string
  state: string
}

interface PersistGoogleDriveOAuthRequestInput {
  redirectUri: string
  returnTo: string
  state: string
}

export interface StoredGoogleDriveOAuthRequest {
  redirectUri: string
  returnTo: string
  state: string
}

export function normalizeGoogleDriveReturnTo(returnTo: string | null | undefined) {
  if (!returnTo || !returnTo.startsWith('/')) {
    return '/chat'
  }

  if (isGoogleDriveCallbackPath(returnTo.split('?')[0] ?? returnTo)) {
    return '/chat'
  }

  return returnTo
}

export function createGoogleDriveOAuthState() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function persistGoogleDriveOAuthRequest({
  redirectUri,
  returnTo,
  state,
}: Readonly<PersistGoogleDriveOAuthRequestInput>) {
  sessionStorage.setItem(GOOGLE_DRIVE_RETURN_TO_KEY, returnTo)
  sessionStorage.setItem(GOOGLE_DRIVE_STATE_KEY, state)
  sessionStorage.setItem(GOOGLE_DRIVE_REDIRECT_URI_KEY, redirectUri)
}

export function readGoogleDriveOAuthRequest(): StoredGoogleDriveOAuthRequest | null {
  const state = sessionStorage.getItem(GOOGLE_DRIVE_STATE_KEY)
  const redirectUri = sessionStorage.getItem(GOOGLE_DRIVE_REDIRECT_URI_KEY)

  if (!state || !redirectUri) {
    return null
  }

  return {
    state,
    redirectUri,
    returnTo: normalizeGoogleDriveReturnTo(sessionStorage.getItem(GOOGLE_DRIVE_RETURN_TO_KEY)),
  }
}

export function clearGoogleDriveOAuthRequest() {
  sessionStorage.removeItem(GOOGLE_DRIVE_RETURN_TO_KEY)
  sessionStorage.removeItem(GOOGLE_DRIVE_STATE_KEY)
  sessionStorage.removeItem(GOOGLE_DRIVE_REDIRECT_URI_KEY)
}

export function isGoogleDriveCallbackPath(pathname: string) {
  return pathname === GOOGLE_DRIVE_CALLBACK_PATH
}

export function buildGoogleDriveAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: Readonly<BuildGoogleDriveAuthorizeUrlInput>) {
  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    include_granted_scopes: 'true',
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPES.join(' '),
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}