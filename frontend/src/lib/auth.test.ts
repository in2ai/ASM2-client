import type { IdTokenClaims } from '@logto/react'
import { describe, expect, it } from 'vite-plus/test'

import { hasRoleInAccessToken, hasRoleInClaim, mapClaimsToUser } from './auth'

function createAccessToken(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64url')
    .replace(/=+$/, '')

  return `header.${encodedPayload}.signature`
}

describe('auth helpers', () => {
  it('maps Logto claims into the frontend user model', () => {
    const user = mapClaimsToUser({
      email: 'ada@example.test',
      name: 'Ada Lovelace',
      roles: ['user'],
      sub: 'user-1',
    } as IdTokenClaims)

    expect(user).toEqual({
      email: 'ada@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'user',
      sub: 'user-1',
    })
  })

  it('prefers the admin role when multiple claim roles are present', () => {
    const user = mapClaimsToUser({
      name: 'Grace Brewster Hopper',
      roles: ['user', 'admin'],
      sub: 'admin-1',
    } as IdTokenClaims)

    expect(user.firstName).toBe('Grace')
    expect(user.lastName).toBe('Brewster Hopper')
    expect(user.role).toBe('admin')
  })

  it('detects roles in claims and access tokens', () => {
    expect(hasRoleInClaim('admin', 'admin')).toBe(true)
    expect(hasRoleInClaim(['user', 'admin'], 'admin')).toBe(true)
    expect(hasRoleInClaim(['user'], 'admin')).toBe(false)

    expect(
      hasRoleInAccessToken(
        createAccessToken({ roles: ['user', 'admin'] }),
        'admin',
      ),
    ).toBe(true)
    expect(
      hasRoleInAccessToken(createAccessToken({ roles: 'user' }), 'admin'),
    ).toBe(false)
    expect(hasRoleInAccessToken('not-a-jwt', 'admin')).toBe(false)
  })
})
