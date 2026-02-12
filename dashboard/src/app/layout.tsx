import { AuthErrorBoundary } from "@/components/auth-error-boundary";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";
import { TRPCReactProvider } from "@/trpc/react";
import { type Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geist.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <AuthErrorBoundary>
              <TRPCReactProvider>
                <NextIntlClientProvider>{children}</NextIntlClientProvider>
              </TRPCReactProvider>
            </AuthErrorBoundary>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
