import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"] });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  metadataBase: new URL("https://sanchijawab.com"),
  title: { default: "SanchiJawab — Your website, now answering every question", template: "%s · SanchiJawab" },
  description:
    "Paste your URL, get a branded AI assistant that answers from your own content, live on your site in under 15 minutes.",
  openGraph: {
    title: "SanchiJawab",
    description: "Your website, now answering every question.",
    siteName: "SanchiJawab",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col font-sans bg-bg text-fg antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
