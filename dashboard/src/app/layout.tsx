import { AuthErrorBoundary } from "@/components/auth-error-boundary";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { type Metadata } from "next";
import { Geist } from "next/font/google";

export const metadata: Metadata = {
  title: "ASM2 Central",
  description: "Dashboard webapp for ASM2",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <AuthErrorBoundary>
              <TRPCReactProvider>{children}</TRPCReactProvider>
            </AuthErrorBoundary>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
