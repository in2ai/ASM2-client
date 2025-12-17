"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/env";
import { AlertCircle } from "lucide-react";
import { Component, type ReactNode } from "react";

interface AuthErrorBoundaryProps {
  children: ReactNode;
}

interface AuthErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Authentication error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-muted/10 flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1 text-center">
              <div className="bg-destructive/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <AlertCircle className="text-destructive h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">
                Error de autenticación
              </CardTitle>
              <CardDescription>
                Ocurrió un error al procesar tu sesión. Por favor, intenta
                nuevamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="bg-muted rounded-md p-3">
                  <p className="text-muted-foreground text-xs">
                    {env.NODE_ENV === "development"
                      ? this.state.error.message
                      : "Error de autenticación interno"}
                  </p>
                </div>
              )}
              <Button
                onClick={() => {
                  this.setState({ hasError: false });
                  globalThis.location.href = "/sign-in";
                }}
                className="w-full"
              >
                Volver a iniciar sesión
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
