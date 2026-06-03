import type { ReactNode } from 'react'

type LogtoProviderProps = {
  children: ReactNode
}

export function LogtoProvider({ children }: Readonly<LogtoProviderProps>) {
  return <>{children}</>
}

export function useLogto() {
  return {
    fetchUserInfo: async () => null,
    getAccessToken: async () => null,
    getIdTokenClaims: async () => null,
    isAuthenticated: false,
    isLoading: false,
    signIn: async () => undefined,
  }
}

export function useHandleSignInCallback() {
  return { isLoading: false }
}
