export const DROPBOX_CALLBACK_PATH = '/chat/provider-callback'

const DROPBOX_INTERNAL_URL_BASE = 'https://dashboard.invalid'
const DROPBOX_OAUTH_RESPONSE_KEYS = [
  'code',
  'error',
  'error_description',
  'state',
]

const DROPBOX_RETURN_TO_KEY = 'chat:dropboxProviderReturnTo'
const DROPBOX_STATE_KEY = 'chat:dropboxOAuthState'
const DROPBOX_REDIRECT_URI_KEY = 'chat:dropboxRedirectUri'

interface BuildDropboxAuthorizeUrlInput {
  clientId: string
  redirectUri: string
  state: string
}

interface PersistDropboxOAuthRequestInput {
  redirectUri: string
  returnTo: string
  state: string
}

export interface StoredDropboxOAuthRequest {
  redirectUri: string
  returnTo: string
  state: string
}

function createSearchParams(search: string | URLSearchParams) {
  if (search instanceof URLSearchParams) {
    return new URLSearchParams(search)
  }

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

function stripDropboxOAuthResponseParams(search: string) {
  const params = createSearchParams(search)

  if (!hasDropboxOAuthResponseParams(params)) {
    return search
  }

  for (const key of DROPBOX_OAUTH_RESPONSE_KEYS) {
    params.delete(key)
  }

  const nextSearch = params.toString()
  return nextSearch ? `?${nextSearch}` : ''
}

export function normalizeDropboxReturnTo(returnTo: string | null | undefined) {
  if (!returnTo?.startsWith('/')) {
    return '/chat'
  }

  const url = new URL(returnTo, DROPBOX_INTERNAL_URL_BASE)

  if (isDropboxCallbackPath(url.pathname)) {
    return '/chat'
  }

  return `${url.pathname}${stripDropboxOAuthResponseParams(url.search)}${url.hash}`
}

export function hasDropboxOAuthResponseParams(
  search: string | URLSearchParams,
) {
  const params = createSearchParams(search)
  return params.has('code') || params.has('error')
}

export function createDropboxOAuthState() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

export function persistDropboxOAuthRequest({
  redirectUri,
  returnTo,
  state,
}: Readonly<PersistDropboxOAuthRequestInput>) {
  sessionStorage.setItem(
    DROPBOX_RETURN_TO_KEY,
    normalizeDropboxReturnTo(returnTo),
  )
  sessionStorage.setItem(DROPBOX_STATE_KEY, state)
  sessionStorage.setItem(DROPBOX_REDIRECT_URI_KEY, redirectUri)
}

export function readDropboxOAuthRequest(): StoredDropboxOAuthRequest | null {
  const state = sessionStorage.getItem(DROPBOX_STATE_KEY)
  const redirectUri = sessionStorage.getItem(DROPBOX_REDIRECT_URI_KEY)

  if (!state || !redirectUri) {
    return null
  }

  return {
    state,
    redirectUri,
    returnTo: normalizeDropboxReturnTo(
      sessionStorage.getItem(DROPBOX_RETURN_TO_KEY),
    ),
  }
}

export function clearDropboxOAuthRequest() {
  sessionStorage.removeItem(DROPBOX_RETURN_TO_KEY)
  sessionStorage.removeItem(DROPBOX_STATE_KEY)
  sessionStorage.removeItem(DROPBOX_REDIRECT_URI_KEY)
}

export function isDropboxCallbackPath(pathname: string) {
  return pathname === DROPBOX_CALLBACK_PATH
}

export function buildDropboxAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: Readonly<BuildDropboxAuthorizeUrlInput>) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Required to get a refresh_token back; the backend's refresh() relies on it.
    token_access_type: 'offline',
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}
