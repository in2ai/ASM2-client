import type { IdTokenClaims } from '@logto/react'
import { describe, expect, it } from 'vite-plus/test'
import {
  hasDashboardAccess,
  hasRoleInAccessToken,
  hasRoleInClaim,
  mapClaimsToUser,
} from './auth'

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

  it('prefers dashboard-capable roles when multiple claim roles are present', () => {
    const admin = mapClaimsToUser({
      name: 'Grace Brewster Hopper',
      roles: ['user', 'admin'],
      sub: 'admin-1',
    } as IdTokenClaims)
    const manager = mapClaimsToUser({
      roles: ['user', 'manager'],
      sub: 'manager-1',
    } as IdTokenClaims)

    expect(admin.firstName).toBe('Grace')
    expect(admin.lastName).toBe('Brewster Hopper')
    expect(admin.role).toBe('admin')
    expect(manager.role).toBe('manager')
  })

  it('detects roles in claims and access tokens', () => {
    expect(hasRoleInClaim('admin', 'admin')).toBe(true)
    expect(hasRoleInClaim(['user', 'admin'], 'admin')).toBe(true)
    expect(hasRoleInClaim(['manager'], 'manager')).toBe(true)
    expect(hasRoleInClaim(['user'], 'admin')).toBe(false)

    expect(
      hasRoleInAccessToken(
        createAccessToken({ roles: ['user', 'admin'] }),
        'admin',
      ),
    ).toBe(true)
    expect(
      hasRoleInAccessToken(createAccessToken({ role: 'manager' }), 'manager'),
    ).toBe(true)
    expect(
      hasRoleInAccessToken(createAccessToken({ roles: 'user' }), 'admin'),
    ).toBe(false)
    expect(hasRoleInAccessToken('not-a-jwt', 'admin')).toBe(false)
  })

  it('allows admins and managers to access the dashboard', () => {
    expect(hasDashboardAccess({ role: 'admin' })).toBe(true)
    expect(hasDashboardAccess({ role: 'manager' })).toBe(true)
    expect(hasDashboardAccess({ role: 'user' })).toBe(false)
    expect(hasDashboardAccess(null)).toBe(false)
  })
})
