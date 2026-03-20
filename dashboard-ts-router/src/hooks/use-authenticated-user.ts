import { useEffect, useState } from 'react'

import { useLogto } from '@logto/react'

import { type LogtoUser, mapClaimsToUser } from '@/lib/auth'

export function useAuthenticatedUser() {
  const { isLoading, isAuthenticated, getIdTokenClaims } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      if (!isAuthenticated) {
        setUser(null)
        return
      }

      const claims = await getIdTokenClaims()
      if (!claims || cancelled) {
        return
      }

      setUser(mapClaimsToUser(claims))
    }

    void loadUser()

    return () => {
      cancelled = true
    }
  }, [getIdTokenClaims, isAuthenticated])

  return {
    isAuthenticated,
    isLoading,
    user,
  }
}
