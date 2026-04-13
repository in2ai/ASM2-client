import type { IdTokenClaims } from '@logto/react'

export interface LogtoUser {
  sub: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  role?: string | null
}

export const ADMIN_SCOPE = 'metrics:export'

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1]

  if (!payload) {
    return null
  }

  const normalizedPayload = payload
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(payload.length + ((4 - (payload.length % 4 || 4)) % 4), '=')

  try {
    return JSON.parse(globalThis.atob(normalizedPayload)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function hasScopeInAccessToken(token: string | null | undefined, scope: string): boolean {
  if (!token) {
    return false
  }

  const payload = parseJwtPayload(token)
  const rawScope = payload?.scope

  return typeof rawScope === 'string' && rawScope.split(' ').includes(scope)
}

function extractGlobalRole(claims: IdTokenClaims): string {
  const rawRoles = claims.roles as string[] | string | undefined

  if (Array.isArray(rawRoles)) {
    const roles = rawRoles.filter(
      (role): role is string => typeof role === 'string' && role.length > 0,
    )

    if (roles.includes('admin')) {
      return 'admin'
    }

    if (roles.length > 0) {
      return roles[0]
    }
  } else if (typeof rawRoles === 'string' && rawRoles.length > 0) {
    return rawRoles
  }

  return 'user'
}

export function mapClaimsToUser(claims: IdTokenClaims): LogtoUser {
  const nameParts = claims.name?.split(' ') ?? []
  const firstName = nameParts[0] ?? null
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

  return {
    sub: claims.sub,
    firstName,
    lastName,
    email: claims.email ?? null,
    role: extractGlobalRole(claims),
  }
}
