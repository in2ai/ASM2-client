import { AuthErrorBoundary } from "@/components/auth-error-boundary";
import { ErrorBoundary } from "@/components/error-boundary";
import "@/styles/globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
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
        <ErrorBoundary>
          <AuthErrorBoundary>
            <TRPCReactProvider>
              <AuthKitProvider>{children}</AuthKitProvider>
            </TRPCReactProvider>
          </AuthErrorBoundary>
        </ErrorBoundary>
      </body>
    </html>
  );
}
