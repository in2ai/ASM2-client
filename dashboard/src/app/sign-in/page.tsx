import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLogtoContext } from "@logto/next/server-actions";
import { logtoConfig } from "@/lib/logto";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Render the sign-in page UI or redirect authenticated users to a safe path.
 *
 * If an authenticated user is detected, the function redirects to `returnTo`
 * when it's a single relative path (starts with "/" and not with "//"); otherwise
 * it redirects to the root ("/"). When no user is authenticated, it returns
 * the sign-in page UI containing a link to the Logto sign-in endpoint.
 *
 * @param searchParams - A Promise resolving to an object that may contain `returnTo`, the optional relative path to navigate to after sign-in.
 * @returns A React element representing the sign-in page when no user is authenticated.
 */
export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ returnTo?: string }>;
}>) {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);

  if (isAuthenticated) {
    const { returnTo } = await searchParams;
    // Only allow relative paths to prevent open redirect
    const safeReturnTo =
      returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    redirect(safeReturnTo);
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="border-border/50 bg-card/80 w-full max-w-md backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="bg-primary shadow-primary/25 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg">
            <BarChart3 className="text-primary-foreground h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">
            ASM<span className="text-primary">2</span> Central
          </CardTitle>
          <CardDescription>
            Inicia sesión para acceder al dashboard de métricas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            asChild
            className="shadow-primary/20 w-full shadow-lg"
            size="lg"
          >
            <Link href="/api/logto/sign-in">Iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
