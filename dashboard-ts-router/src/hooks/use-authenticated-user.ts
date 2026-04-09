import { useEffect, useState } from 'react'

import { useLogto } from '@logto/react'

import { API_RESOURCE } from '@/lib/api'
import { ADMIN_SCOPE, hasScopeInAccessToken, mapClaimsToUser } from '@/lib/auth'
import type { LogtoUser } from '@/lib/auth'

export function useAuthenticatedUser() {
  const { isLoading, isAuthenticated, getAccessToken, getIdTokenClaims } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      if (!isAuthenticated) {
        setUser(null)
        return
      }

      const [claims, accessToken] = await Promise.all([
        getIdTokenClaims(),
        getAccessToken(API_RESOURCE).catch(() => null),
      ])

      if (!claims || cancelled) {
        return
      }

      const nextUser = mapClaimsToUser(claims)

      setUser(
        hasScopeInAccessToken(accessToken, ADMIN_SCOPE)
          ? { ...nextUser, role: 'admin' }
          : nextUser,
      )
    }

    void loadUser()

    return () => {
      cancelled = true
    }
  }, [getAccessToken, getIdTokenClaims, isAuthenticated])

  return {
    isAuthenticated,
    isLoading,
    user,
  }
}
