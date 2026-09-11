import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import {
  buildDropboxAuthorizeUrl,
  clearDropboxOAuthRequest,
  DROPBOX_CALLBACK_PATH,
  hasDropboxOAuthResponseParams,
  isDropboxCallbackPath,
  normalizeDropboxReturnTo,
  persistDropboxOAuthRequest,
  readDropboxOAuthRequest,
} from './dropbox-auth'

describe('dropbox auth helpers', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('builds a Dropbox OAuth authorization URL for the frontend flow', () => {
    const url = new URL(
      buildDropboxAuthorizeUrl({
        clientId: 'dropbox-client-id',
        redirectUri: 'http://localhost:3001/chat/provider-callback',
        state: 'oauth-state',
      }),
    )

    expect(url.origin).toBe('https://www.dropbox.com')
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(url.searchParams.get('client_id')).toBe('dropbox-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/chat/provider-callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('oauth-state')
    // Required so the backend's refresh() gets a refresh_token back.
    expect(url.searchParams.get('token_access_type')).toBe('offline')
  })

  it('stores and reads the pending OAuth request from sessionStorage', () => {
    persistDropboxOAuthRequest({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat?panel=sources',
      state: 'oauth-state',
    })

    expect(readDropboxOAuthRequest()).toEqual({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat?panel=sources',
      state: 'oauth-state',
    })
  })

  it('clears the pending OAuth request from sessionStorage', () => {
    persistDropboxOAuthRequest({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat',
      state: 'oauth-state',
    })

    clearDropboxOAuthRequest()

    expect(readDropboxOAuthRequest()).toBeNull()
  })

  it('detects the Dropbox callback path', () => {
    expect(isDropboxCallbackPath(DROPBOX_CALLBACK_PATH)).toBe(true)
    expect(isDropboxCallbackPath('/chat')).toBe(false)
  })

  it('normalizes invalid callback return targets back to /chat', () => {
    expect(normalizeDropboxReturnTo(undefined)).toBe('/chat')
    expect(normalizeDropboxReturnTo('https://example.com')).toBe('/chat')
    expect(normalizeDropboxReturnTo('/chat/provider-callback?code=abc')).toBe(
      '/chat',
    )
    expect(normalizeDropboxReturnTo('/chat?code=abc&state=oauth-state')).toBe(
      '/chat',
    )
    expect(normalizeDropboxReturnTo('/chats?code=abc&panel=sources')).toBe(
      '/chats?panel=sources',
    )
    expect(normalizeDropboxReturnTo('/chat?panel=sources')).toBe(
      '/chat?panel=sources',
    )
  })

  it('detects OAuth callback params even outside the callback route', () => {
    expect(hasDropboxOAuthResponseParams('?code=abc&state=oauth-state')).toBe(
      true,
    )
    expect(hasDropboxOAuthResponseParams('?error=access_denied')).toBe(true)
    expect(hasDropboxOAuthResponseParams('?panel=sources')).toBe(false)
  })
})
