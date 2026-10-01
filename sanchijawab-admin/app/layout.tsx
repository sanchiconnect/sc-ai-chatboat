import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "SanchiJawab",
  description: "AI chatbot trained on your website and files",
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
