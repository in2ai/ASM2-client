import type { IdTokenClaims } from '@logto/react'

export interface LogtoUser {
  sub: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  role?: string | null
  organizationId?: string | null
}

export function mapClaimsToUser(claims: IdTokenClaims): LogtoUser {
  const nameParts = claims.name?.split(' ') ?? []
  const firstName = nameParts[0] ?? null
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

  const organizationRoles = claims.organization_roles ?? []
  let role: string | null = 'user'

  if (organizationRoles.length > 0) {
    const firstRole = organizationRoles[0]
    if (typeof firstRole === 'string') {
      const roleParts = firstRole.split(':')
      role = roleParts.length > 1 ? roleParts[1] || 'user' : 'user'
    }
  }

  return {
    sub: claims.sub,
    firstName,
    lastName,
    email: claims.email ?? null,
    role,
    organizationId: claims.organizations?.[0] ?? null,
  }
}
