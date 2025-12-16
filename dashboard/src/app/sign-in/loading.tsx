import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SignInLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Cargando página de inicio de sesión...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
