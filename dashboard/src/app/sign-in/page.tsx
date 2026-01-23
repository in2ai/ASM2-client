import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Render the sign-in page UI or redirect authenticated users to a safe path.
 *
 * If an authenticated user is detected, the function redirects to `returnTo`
 * when it's a single relative path (starts with "/" and not with "//"); otherwise
 * it redirects to the root ("/"). When no user is authenticated, it returns
 * the sign-in page UI containing a link to the WorkOS sign-in URL.
 *
 * @param searchParams - A Promise resolving to an object that may contain `returnTo`, the optional relative path to navigate to after sign-in.
 * @returns A React element representing the sign-in page when no user is authenticated.
 */
export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ returnTo?: string }>;
}>) {
  const { user } = await withAuth();

  if (user) {
    const { returnTo } = await searchParams;
    // Only allow relative paths to prevent open redirect
    const safeReturnTo =
      returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    redirect(safeReturnTo);
  }

  const signInUrl = await getSignInUrl();

  return (
    <div className="bg-muted/10 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <BarChart3 className="text-primary-foreground h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">ASM2 Central</CardTitle>
          <CardDescription>
            Inicia sesión para acceder al dashboard de métricas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" size="lg">
            <Link href={signInUrl}>Iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}