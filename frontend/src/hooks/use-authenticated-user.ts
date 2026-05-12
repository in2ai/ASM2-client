import { API_RESOURCE } from '@/lib/api'
import type { LogtoUser } from '@/lib/auth'
import { hasRoleInAccessToken, hasRoleInClaim, mapClaimsToUser } from '@/lib/auth'
import { useLogto } from '@logto/react'
import { useEffect, useState } from 'react'

export function useAuthenticatedUser() {
  const {
    fetchUserInfo,
    isLoading,
    isAuthenticated,
    getAccessToken,
    getIdTokenClaims,
  } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      if (!isAuthenticated) {
        setUser(null)
        return
      }

      const [claims, accessToken, userInfo] = await Promise.all([
        getIdTokenClaims(),
        getAccessToken(API_RESOURCE).catch(() => null),
        fetchUserInfo().catch(() => null),
      ])

      if (!claims || cancelled) {
        return
      }

      const nextUser = mapClaimsToUser(claims)
      const isAdmin =
        hasRoleInClaim(
          (userInfo as Record<string, unknown> | null)?.roles,
          'admin',
        ) || hasRoleInAccessToken(accessToken, 'admin')

      setUser(
        isAdmin
          ? { ...nextUser, role: 'admin' }
          : nextUser,
      )
    }

    void loadUser()

    return () => {
      cancelled = true
    }
  }, [fetchUserInfo, getAccessToken, getIdTokenClaims, isAuthenticated])

  return {
    isAuthenticated,
    isLoading,
    user,
  }
}
