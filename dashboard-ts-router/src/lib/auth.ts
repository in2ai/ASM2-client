import type { IdTokenClaims } from '@logto/react'

export interface LogtoUser {
  sub: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  role?: string | null
}

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
    return JSON.parse(globalThis.atob(normalizedPayload)) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

function normalizeRoles(rawRoles: unknown): string[] {
  if (Array.isArray(rawRoles)) {
    return rawRoles.filter(
      (role): role is string => typeof role === 'string' && role.length > 0,
    )
  }

  if (typeof rawRoles === 'string' && rawRoles.length > 0) {
    return [rawRoles]
  }

  return []
}

function extractRole(roles: string[]): string {
  if (roles.includes('admin')) {
    return 'admin'
  }

  return roles[0] ?? 'user'
}

export function hasRoleInAccessToken(
  token: string | null | undefined,
  role: string,
): boolean {
  if (!token) {
    return false
  }

  const payload = parseJwtPayload(token)
  return normalizeRoles(payload?.roles).includes(role)
}

export function hasRoleInClaim(rawRoles: unknown, role: string): boolean {
  return normalizeRoles(rawRoles).includes(role)
}

function extractGlobalRole(claims: IdTokenClaims): string {
  return extractRole(normalizeRoles(claims.roles))
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
