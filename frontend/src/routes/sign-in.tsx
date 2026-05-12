import { useEffect } from 'react'

import { useLogto } from '@logto/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BarChart3 } from 'lucide-react'
import { z } from 'zod'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslations } from 'next-intl'

const signInSearchSchema = z.object({
  returnTo: z.string().optional(),
})

export const Route = createFileRoute('/sign-in')({
  validateSearch: signInSearchSchema,
  component: SignInPage,
})

function SignInPage() {
  const t = useTranslations('SignInPage')
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { isAuthenticated, signIn, isLoading } = useLogto()

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const safeReturnTo =
      search.returnTo?.startsWith('/') && !search.returnTo.startsWith('//')
        ? search.returnTo
        : '/'

    void navigate({ to: safeReturnTo })
  }, [isAuthenticated, navigate, search.returnTo])

  const handleSignIn = async () => {
    const safeReturnTo =
      search.returnTo?.startsWith('/') && !search.returnTo.startsWith('//')
        ? search.returnTo
        : '/'

    sessionStorage.setItem('dashboard:returnTo', safeReturnTo)
    await signIn(`${window.location.origin}/callback`)
  }

  if (isLoading) {
    return null
  }

  return (
    <div className="bg-background relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <Card className="border-border/50 bg-card/80 w-full max-w-md backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="bg-primary shadow-primary/25 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg">
            <BarChart3 className="text-primary-foreground h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">
            ASM<span className="text-primary">2</span> Central
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="shadow-primary/20 w-full shadow-lg"
            size="lg"
            onClick={() => void handleSignIn()}
          >
            {t('signInButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
