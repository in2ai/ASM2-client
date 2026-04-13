import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildGoogleDriveAuthorizeUrl,
  clearGoogleDriveOAuthRequest,
  GOOGLE_DRIVE_CALLBACK_PATH,
  hasGoogleDriveOAuthResponseParams,
  isGoogleDriveCallbackPath,
  normalizeGoogleDriveReturnTo,
  persistGoogleDriveOAuthRequest,
  readGoogleDriveOAuthRequest,
} from './google-drive-auth'

describe('google drive auth helpers', () => {
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

  it('builds a Google OAuth authorization URL for the frontend flow', () => {
    const url = new URL(
      buildGoogleDriveAuthorizeUrl({
        clientId: 'google-client-id',
        redirectUri: 'http://localhost:3001/chat/provider-callback',
        state: 'oauth-state',
      }),
    )

    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.pathname).toBe('/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('google-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/chat/provider-callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(
      [
        'https://www.googleapis.com/auth/drive.readonly',
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' '),
    )
    expect(url.searchParams.get('state')).toBe('oauth-state')
    expect(url.searchParams.get('access_type')).toBe('offline')
  })

  it('stores and reads the pending OAuth request from sessionStorage', () => {
    persistGoogleDriveOAuthRequest({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat?panel=sources',
      state: 'oauth-state',
    })

    expect(readGoogleDriveOAuthRequest()).toEqual({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat?panel=sources',
      state: 'oauth-state',
    })
  })

  it('clears the pending OAuth request from sessionStorage', () => {
    persistGoogleDriveOAuthRequest({
      redirectUri: 'http://localhost:3001/chat/provider-callback',
      returnTo: '/chat',
      state: 'oauth-state',
    })

    clearGoogleDriveOAuthRequest()

    expect(readGoogleDriveOAuthRequest()).toBeNull()
  })

  it('detects the Google Drive callback path', () => {
    expect(isGoogleDriveCallbackPath(GOOGLE_DRIVE_CALLBACK_PATH)).toBe(true)
    expect(isGoogleDriveCallbackPath('/chat')).toBe(false)
  })

  it('normalizes invalid callback return targets back to /chat', () => {
    expect(normalizeGoogleDriveReturnTo(undefined)).toBe('/chat')
    expect(normalizeGoogleDriveReturnTo('https://example.com')).toBe('/chat')
    expect(
      normalizeGoogleDriveReturnTo('/chat/provider-callback?code=abc'),
    ).toBe('/chat')
    expect(
      normalizeGoogleDriveReturnTo(
        '/chat?code=abc&state=oauth-state&scope=drive&iss=https://accounts.google.com&hd=in2ai.com',
      ),
    ).toBe('/chat')
    expect(normalizeGoogleDriveReturnTo('/chats?code=abc&panel=sources')).toBe(
      '/chats?panel=sources',
    )
    expect(normalizeGoogleDriveReturnTo('/chat?panel=sources')).toBe(
      '/chat?panel=sources',
    )
  })

  it('detects OAuth callback params even outside the callback route', () => {
    expect(
      hasGoogleDriveOAuthResponseParams('?code=abc&state=oauth-state'),
    ).toBe(true)
    expect(hasGoogleDriveOAuthResponseParams('?error=access_denied')).toBe(true)
    expect(hasGoogleDriveOAuthResponseParams('?panel=sources')).toBe(false)
  })
})
