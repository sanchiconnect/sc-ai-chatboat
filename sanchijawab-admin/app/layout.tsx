import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
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

const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("sj-theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before paint so an explicit saved theme choice never flashes
            the wrong one on load — can't do this with a useEffect alone. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans bg-bg text-fg">{children}</body>
    </html>
  );
}
