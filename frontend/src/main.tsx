import { shouldRetryQuery } from '@/lib/api-error'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LogtoProvider } from '@logto/react'

import { I18nProvider } from '@/i18n/provider'
import { logtoConfig } from '@/lib/logto'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

/**
 * Defaults, rather than nothing at all: without a `staleTime` every mount
 * refetches, so moving between chat and dashboard re-asked the backend for
 * data it had just been given. A minute of reuse is well inside how often
 * any of this actually changes, and the polling queries set their own.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60_000,
      // A lost token or a 404 is not worth three more round trips; a flaky
      // connection is. Retry the second kind only.
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <LogtoProvider config={logtoConfig}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TooltipProvider>
              <I18nProvider>
                <RouterProvider router={router} />
                <Toaster />
              </I18nProvider>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </LogtoProvider>
    </React.StrictMode>,
  )
}
