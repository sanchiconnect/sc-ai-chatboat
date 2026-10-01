"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";

type PublicPlan = {
  plan_id: string; name: string; price_text: string; tagline: string; features: string[]; sort_order: number;
};

const STEPS = [
  {
    n: "01",
    title: "Point it at your site",
    body: "A URL — a single page, a sitemap, or the whole domain. It crawls, strips nav/ads/footers, and keeps only the real content.",
    icon: (
      <path d="M12 2a10 10 0 1 0 10 10M12 2a10 10 0 0 1 10 10M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10M12 2a15 15 0 0 0-4 10 15 15 0 0 0 4 10M2 12h20" />
    ),
  },
  {
    n: "02",
    title: "Add files it should know",
    body: "PDFs, docs, spreadsheets, or manual Q&A pairs. Mark anything internal-only so it never reaches a visitor.",
    icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6" />,
  },
  {
    n: "03",
    title: "Drop one line on your site",
    body: "A single script tag. The widget answers from your content only, in the visitor's language, with the source cited every time.",
    icon: <path d="M16 18l6-6-6-6 M8 6l-6 6 6 6" />,
  },
];

const FEATURES = [
  {
    title: "Grounded, cited answers",
    body: "Every answer is backed by passages from your own content — never a guess. Sources are shown inline so visitors can verify them.",
    tone: "accent",
    icon: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  },
  {
    title: "Live human handoff",
    body: "When a visitor asks for a person, or the bot isn't confident, the conversation lands in your inbox — take over without losing context.",
    tone: "warm",
    icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />,
  },
  {
    title: "Leads without a form builder",
    body: "Capture name, email and intent mid-conversation, export it, or push it straight into your CRM.",
    tone: "success",
    icon: <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M20 8v6 M23 11h-6" />,
  },
  {
    title: "Speaks your visitor's language",
    body: "Detects the language a visitor writes in and replies in kind — no separate setup per market.",
    tone: "accent",
    icon: <path d="M5 8h10 M8 5v3a8.5 8.5 0 0 1-4.5 7.5 M9 8a12 12 0 0 0 8 8 M13 19l4-8 4 8 M14.5 16h5" />,
  },
  {
    title: "Built to match your site",
    body: "Theme colors, position, welcome message, and the bot's own name and avatar — not bolted on, part of the page.",
    tone: "warm",
    icon: <path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21 7.5 13.5 2 9h7z" />,
  },
  {
    title: "See what's working",
    body: "Resolution rate, handoffs, unanswered questions, top questions — one dashboard, not a spreadsheet you build yourself.",
    tone: "success",
    icon: <path d="M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3" />,
  },
];

const DEMO_SCRIPT = [
  { role: "bot", text: "We support monthly and annual billing — annual saves about 20%. Want the exact numbers?", source: "pricing.html" },
  { role: "visitor", text: "yes please" },
  { role: "bot", text: "On the Growth plan that's ₹2,999/mo monthly, or ₹28,790/yr billed annually. Want me to connect you with sales?" },
] as const;

function DemoChat() {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    if (shown >= DEMO_SCRIPT.length) {
      const reset = setTimeout(() => {
        setShown(0);
        setTyping(true);
      }, 3200);
      return () => clearTimeout(reset);
    }
    const isBot = DEMO_SCRIPT[shown].role === "bot";
    const delay = isBot ? 900 : 450;
    const t = setTimeout(() => {
      setShown((s) => s + 1);
      setTyping(DEMO_SCRIPT[shown + 1]?.role === "bot");
    }, delay);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden max-w-[360px] ml-auto">
      <div className="bg-accent text-white px-4 py-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-[15px] font-bold">R</div>
        <div>
          <div className="text-[13.5px] font-semibold leading-tight">Riya</div>
          <div className="text-[11px] text-white/75 leading-tight">Usually replies instantly</div>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2.5 bg-surface-2 min-h-[188px]">
        {DEMO_SCRIPT.slice(0, shown).map((m, i) =>
          m.role === "bot" ? (
            <div key={i} className="bg-surface border border-border rounded-xl rounded-tl-sm px-3 py-2 text-[13px] max-w-[85%] leading-snug animate-[fadeIn_.25s_ease]">
              {m.text}
              {"source" in m && <div className="mt-1.5 text-[10.5px] text-fg-faint">Source: {m.source}</div>}
            </div>
          ) : (
            <div key={i} className="bg-accent text-white rounded-xl rounded-tr-sm px-3 py-2 text-[13px] max-w-[75%] ml-auto leading-snug animate-[fadeIn_.25s_ease]">
              {m.text}
            </div>
          ),
        )}
        {typing && shown < DEMO_SCRIPT.length && (
          <div className="bg-surface border border-border rounded-xl rounded-tl-sm px-3 py-2.5 w-fit flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-fg-faint animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-fg-faint animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-fg-faint animate-bounce" />
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border bg-surface">
        <div className="border border-border rounded-full px-3 py-2 text-[12.5px] text-fg-faint">Ask a question…</div>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  accent: "bg-accent-soft text-accent-ink",
  warm: "bg-warm-soft text-warm",
  success: "bg-success-soft text-success",
};

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>([]);

  useEffect(() => {
    setLoggedIn(!!getToken());
    api.publicPlans().then(setPlans).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Nav */}
      <header
        className="border-b border-border sticky top-0 z-10 backdrop-blur"
        style={{ backgroundColor: "color-mix(in srgb, var(--bg) 80%, transparent)" }}
      >
        <div className="max-w-[1180px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="font-display text-[19px] font-semibold tracking-tight">SanchiJawab</div>
          <nav className="flex items-center gap-5 sm:gap-6">
            <a href="#how" className="hidden sm:inline text-[13.5px] text-fg-muted hover:text-fg transition-colors">
              How it works
            </a>
            <a href="#features" className="hidden sm:inline text-[13.5px] text-fg-muted hover:text-fg transition-colors">
              Features
            </a>
            <Link href={loggedIn ? "/dashboard" : "/login"} className="text-[13.5px] text-fg-muted hover:text-fg transition-colors">
              {loggedIn ? "Dashboard" : "Log in"}
            </Link>
            <Link
              href={loggedIn ? "/dashboard" : "/signup"}
              className="bg-accent text-white text-[13.5px] font-semibold rounded-lg px-4 py-2 hover:brightness-90 transition-[filter]"
            >
              {loggedIn ? "Open dashboard" : "Start free"}
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(540px circle at 15% 15%, var(--accent-soft), transparent 60%), radial-gradient(480px circle at 92% 8%, var(--warm-soft), transparent 55%)",
          }}
        />
        <div className="max-w-[1180px] mx-auto px-5 pt-20 pb-16 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="text-[13px] font-semibold text-accent-ink bg-accent-soft inline-block rounded-full px-3 py-1 mb-5">
              Trained on your site, not the open internet
            </p>
            <h1 className="font-display text-[42px] sm:text-[54px] leading-[1.03] font-semibold tracking-tight text-balance">
              Your website,
              <br />
              answering back.
            </h1>
            <p className="mt-5 text-[17px] text-fg-muted max-w-[480px] leading-relaxed">
              SanchiJawab crawls your site and files, then gives you a chat widget that answers visitors
              from your own content — with real citations, lead capture, and a human always one click away.
            </p>
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <Link
                href={loggedIn ? "/dashboard" : "/signup"}
                className="bg-accent text-white font-semibold rounded-xl px-6 py-3 text-[15px] hover:brightness-90 transition-[filter] shadow-card"
              >
                {loggedIn ? "Open dashboard" : "Start free — no card needed"}
              </Link>
              <a href="#how" className="text-[14px] font-medium text-fg-muted hover:text-fg transition-colors">
                See how it works →
              </a>
            </div>
          </div>

          <DemoChat />
        </div>
      </section>

      {/* How it works — connected pipeline */}
      <section id="how" className="border-t border-border bg-surface-2">
        <div className="max-w-[1180px] mx-auto px-5 py-16">
          <h2 className="font-display text-[28px] font-semibold text-center">Three steps, not a project</h2>
          <div className="mt-12 relative grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6">
            <div className="hidden sm:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-border" aria-hidden />
            {STEPS.map((s) => (
              <div key={s.n} className="relative text-center sm:text-left">
                <div className="mx-auto sm:mx-0 w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center relative shadow-card">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </div>
                <div className="mt-4 font-display text-[13px] font-semibold text-accent-ink">{s.n}</div>
                <h3 className="mt-1 font-display text-[18px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[13.5px] text-fg-muted leading-relaxed max-w-[260px] mx-auto sm:mx-0">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-[1180px] mx-auto px-5 py-16">
        <h2 className="font-display text-[28px] font-semibold text-center">
          Everything a support chatbot needs, nothing it doesn&apos;t
        </h2>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="border border-border rounded-2xl p-5 hover:border-accent transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TONE_CLASSES[f.tone]}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="mt-3 font-semibold text-[14.5px]">{f.title}</h3>
              <p className="mt-1.5 text-[13px] text-fg-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Philosophy callout */}
      <section className="border-t border-border bg-surface-2">
        <div className="max-w-[760px] mx-auto px-5 py-16 text-center">
          <p className="font-display text-[22px] sm:text-[26px] leading-snug text-balance">
            “If it isn&apos;t in your content, it isn&apos;t in the answer.”
          </p>
          <p className="mt-3 text-[13.5px] text-fg-muted max-w-[480px] mx-auto">
            No general-knowledge guessing, no making things up to sound helpful. When your content doesn&apos;t
            cover something, SanchiJawab says so and offers a human instead of a hallucination.
          </p>
        </div>
      </section>

      {/* Pricing */}
      {plans.length > 0 && (
        <section id="pricing" className="py-16">
          <div className="max-w-[1180px] mx-auto px-5">
            <h2 className="font-display text-[28px] font-semibold text-center">Simple pricing</h2>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[900px] mx-auto">
              {plans
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((p) => (
                  <div key={p.plan_id} className="bg-surface border border-border rounded-2xl shadow-card p-6 flex flex-col">
                    <h3 className="font-display text-[18px] font-semibold">{p.name}</h3>
                    <div className="mt-1 text-[22px] font-semibold tabular">{p.price_text}</div>
                    <p className="mt-1 text-[13px] text-fg-muted">{p.tagline}</p>
                    <ul className="mt-4 space-y-1.5 flex-1">
                      {p.features.map((f, i) => (
                        <li key={i} className="text-[12.5px] flex gap-1.5">
                          <span className="text-success">✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={loggedIn ? "/dashboard" : "/signup"}
                      className="mt-5 text-center bg-accent text-white rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:brightness-90 transition-[filter]"
                    >
                      {loggedIn ? "Open dashboard" : "Get started"}
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border-t border-border bg-accent-soft">
        <div className="max-w-[1180px] mx-auto px-5 py-16 text-center">
          <h2 className="font-display text-[28px] font-semibold text-accent-ink">Give your site a voice</h2>
          <p className="mt-2 text-[14.5px] text-fg-muted">Set up takes minutes. The free trial needs no card.</p>
          <Link
            href={loggedIn ? "/dashboard" : "/signup"}
            className="mt-6 inline-block bg-accent text-white font-semibold rounded-xl px-6 py-3 text-[15px] hover:brightness-90 transition-[filter] shadow-card"
          >
            {loggedIn ? "Open dashboard" : "Start free"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-[1180px] mx-auto px-5 py-8 flex items-center justify-between text-[12.5px] text-fg-faint flex-wrap gap-2">
          <span>© {new Date().getFullYear()} SanchiJawab</span>
          <span>Built on your content. Nothing else.</span>
        </div>
      </footer>
    </div>
  );
}
