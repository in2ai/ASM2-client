import type { IdTokenClaims } from '@logto/react'

export interface LogtoUser {
  sub: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  role?: string | null
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
