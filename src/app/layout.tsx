import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeProvider } from "@/app/components/theme-provider";
import { ThemeToggle } from "@/app/components/theme-toggle";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
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
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<div className="min-h-screen bg-background flex flex-col">
						<nav className="border-b">
							<div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
								<Link href="/" className="flex items-center gap-3">
									<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center font-bold text-white text-sm">
										PP
									</div>
									<span className="text-xl font-semibold tracking-tight">
										Planning Poker
									</span>
								</Link>
								<ThemeToggle />
							</div>
						</nav>

						<main className="flex-1">{children}</main>

						<footer className="border-t px-6 py-6">
							<div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
								Built for agile teams • Dark & Light modes included
							</div>
						</footer>
					</div>
				</ThemeProvider>
			</body>
		</html>
	);
}
