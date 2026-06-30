import type { IdTokenClaims } from '@logto/react'

export const ADMIN_ROLE = 'admin'
export const MANAGER_ROLE = 'manager'
export const USER_ROLE = 'user'

export const DASHBOARD_ACCESS_ROLES = [ADMIN_ROLE, MANAGER_ROLE] as const

const ROLE_PRIORITY = [ADMIN_ROLE, MANAGER_ROLE] as const

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
  const priorityRole = ROLE_PRIORITY.find((role) => roles.includes(role))

  return priorityRole ?? USER_ROLE
}

export function hasRoleInAccessToken(
  token: string | null | undefined,
  role: string,
): boolean {
  if (!token) {
    return false
  }

  const payload = parseJwtPayload(token)
  const roles = [
    ...normalizeRoles(payload?.roles),
    ...normalizeRoles(payload?.role),
  ]

  return roles.includes(role)
}

export function hasRoleInClaim(rawRoles: unknown, role: string): boolean {
  return normalizeRoles(rawRoles).includes(role)
}

export function hasDashboardAccess(
  user: Pick<LogtoUser, 'role'> | null | undefined,
): boolean {
  return DASHBOARD_ACCESS_ROLES.some((role) => user?.role === role)
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
