"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  /**
   * Error message to display to the user
   */
  message: string;
  /**
   * Optional title for the error card
   */
  title?: string;
  /**
   * Callback function to retry the failed operation
   */
  onRetry?: () => void;
  /**
   * Whether the retry operation is in progress
   */
  isRetrying?: boolean;
  /**
   * Optional callback to navigate home
   */
  onGoHome?: () => void;
  /**
   * Show the home button
   */
  showHomeButton?: boolean;
}

/**
 * ErrorState component displays user-friendly error messages with retry functionality
 * Used throughout the application to handle various error scenarios
 */
export function ErrorState({
  message,
  title = "Error loading data",
  onRetry,
  isRetrying = false,
  onGoHome,
  showHomeButton = false,
}: Readonly<ErrorStateProps>) {
  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5 mx-auto max-w-3xl">
      <CardHeader className="pb-4 sm:pb-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="bg-destructive/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12">
            <AlertCircle className="text-destructive h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
            <CardDescription className="mt-1.5 text-sm sm:text-base">
              {message}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              className="gap-2 min-h-[44px] w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
              />
              {isRetrying ? "Retrying..." : "Retry"}
            </Button>
          )}
          {showHomeButton && (
            <Button variant="ghost" onClick={handleGoHome} className="gap-2 min-h-[44px] w-full sm:w-auto">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
