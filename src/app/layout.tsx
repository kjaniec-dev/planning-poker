import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import { ThemeProvider } from "@/app/components/theme-provider";
import { ThemeToggle } from "@/app/components/theme-toggle";

const inter = Inter({
  variable: "--kj-font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--kj-font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Planning Poker",
  description: "Estimate together",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-canvas flex flex-col">
            <nav className="border-b border-border/60">
              <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                <Link href="/" className="flex items-center gap-3 group">
                  <Image
                    src="/logo-light.png"
                    alt="Planning Poker"
                    width={160}
                    height={40}
                    className="h-10 w-auto dark:hidden"
                    priority
                  />
                  <Image
                    src="/logo-dark.png"
                    alt="Planning Poker"
                    width={160}
                    height={40}
                    className="h-10 w-auto hidden dark:block"
                    priority
                  />
                  <span className="text-base font-semibold tracking-tight">
                    Planning Poker
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                </div>
              </div>
            </nav>

            <main className="flex-1">{children}</main>

            <footer className="border-t border-border/60 px-6 py-6">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-secondary shadow-[0_0_8px_var(--kj-secondary)]" />
                  Real-time · open source
                </span>
                <span className="text-xs uppercase tracking-[0.18em]">
                  Built for agile teams
                </span>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
