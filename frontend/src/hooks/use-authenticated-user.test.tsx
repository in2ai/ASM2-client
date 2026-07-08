// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useAuthenticatedUser } from './use-authenticated-user'

const mocks = vi.hoisted(() => ({
  fetchUserInfo: vi.fn(),
  getAccessToken: vi.fn(),
  getIdTokenClaims: vi.fn(),
  isAuthenticated: false,
  isLoading: false,
}))

vi.mock('@/lib/api', () => ({
  API_RESOURCE: 'api-resource',
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    fetchUserInfo: mocks.fetchUserInfo,
    getAccessToken: mocks.getAccessToken,
    getIdTokenClaims: mocks.getIdTokenClaims,
    isAuthenticated: mocks.isAuthenticated,
    isLoading: mocks.isLoading,
  }),
}))

function createAccessToken(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64url')
    .replace(/=+$/, '')

  return `header.${encodedPayload}.signature`
}

describe('useAuthenticatedUser', () => {
  beforeEach(() => {
    mocks.fetchUserInfo.mockResolvedValue(null)
    mocks.getAccessToken.mockResolvedValue(null)
    mocks.getIdTokenClaims.mockResolvedValue(null)
    mocks.isAuthenticated = false
    mocks.isLoading = false
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('returns no user when Logto is unauthenticated', () => {
    const { result } = renderHook(() => useAuthenticatedUser())

    expect(result.current).toEqual({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    })
    expect(mocks.getIdTokenClaims).not.toHaveBeenCalled()
  })

  it('maps authenticated claims and promotes admin role from user info', async () => {
    mocks.isAuthenticated = true
    mocks.getIdTokenClaims.mockResolvedValue({
      email: 'ada@example.test',
      name: 'Ada Lovelace',
      roles: ['user'],
      sub: 'user-1',
    })
    mocks.fetchUserInfo.mockResolvedValue({ roles: ['admin'] })

    const { result } = renderHook(() => useAuthenticatedUser())

    await waitFor(() => {
      expect(result.current.user).toEqual({
        email: 'ada@example.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'admin',
        sub: 'user-1',
      })
    })
  })

  it('promotes admin role from the access token when user info is unavailable', async () => {
    mocks.isAuthenticated = true
    mocks.getIdTokenClaims.mockResolvedValue({
      email: 'grace@example.test',
      name: 'Grace Hopper',
      roles: ['user'],
      sub: 'user-2',
    })
    mocks.getAccessToken.mockResolvedValue(
      createAccessToken({ roles: ['admin'] }),
    )

    const { result } = renderHook(() => useAuthenticatedUser())

    await waitFor(() => {
      expect(result.current.user?.role).toBe('admin')
    })
  })

  it('promotes manager role from the access token when user info is unavailable', async () => {
    mocks.isAuthenticated = true
    mocks.getIdTokenClaims.mockResolvedValue({
      email: 'marie@example.test',
      name: 'Marie Curie',
      roles: ['user'],
      sub: 'user-3',
    })
    mocks.getAccessToken.mockResolvedValue(
      createAccessToken({ roles: ['manager'] }),
    )

    const { result } = renderHook(() => useAuthenticatedUser())

    await waitFor(() => {
      expect(result.current.user?.role).toBe('manager')
    })
  })

  it('keeps admin priority when another source only has manager', async () => {
    mocks.isAuthenticated = true
    mocks.getIdTokenClaims.mockResolvedValue({
      email: 'katherine@example.test',
      name: 'Katherine Johnson',
      roles: ['admin'],
      sub: 'admin-2',
    })
    mocks.getAccessToken.mockResolvedValue(
      createAccessToken({ roles: ['manager'] }),
    )

    const { result } = renderHook(() => useAuthenticatedUser())

    await waitFor(() => {
      expect(result.current.user?.role).toBe('admin')
    })
  })
})
