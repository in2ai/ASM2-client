import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default async function SignInPage() {
  const { user } = await withAuth();

  // If already authenticated, redirect to home
  if (user) {
    redirect("/");
  }

  const signInUrl = await getSignInUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <BarChart3 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">ACM2 Central</CardTitle>
          <CardDescription>
            Inicia sesión para acceder al dashboard de métricas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInUrl} method="get">
            <Button type="submit" className="w-full" size="lg">
              Iniciar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
