import { RouteError } from '@/components/route-error'
import { NotFound } from '@/components/not-found'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
// Served with the app rather than from a font CDN: the page no longer waits
// on a stylesheet from another origin before it can draw anything.
import '@fontsource-variable/geist'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const showDevtools =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS !== 'false'

  if (!showDevtools) {
    return <Outlet />
  }

  return (
    <>
      <Outlet />
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
