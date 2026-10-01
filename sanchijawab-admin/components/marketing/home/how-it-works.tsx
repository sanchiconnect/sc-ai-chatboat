import { Globe, Scissors, BrainCircuit, Code2 } from "lucide-react";

const steps = [
  {
    icon: Globe,
    title: "Point us at your domain",
    body: "Give SanchiJawab a URL. Our crawler walks every reachable page breadth-first, respecting robots.txt and your sitemap.",
  },
  {
    icon: Scissors,
    title: "We chunk & embed",
    body: "Pages are split into ~380 semantic chunks on average, embedded, and stored in a pgvector index scoped to your workspace.",
  },
  {
    icon: BrainCircuit,
    title: "Retrieval meets your tone",
    body: "Set a name, personality, and guardrails. Every answer is grounded in retrieved chunks — never a free-floating guess.",
  },
  {
    icon: Code2,
    title: "Ship one script tag",
    body: "Paste one line before </body>. The widget is live, themed to match your site, on desktop and mobile alike.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border py-20">
      <div className="container">
        <div className="mx-auto mb-14 max-w-[52ch] text-center">
          <h2 className="font-display text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            From URL to live widget in four steps
          </h2>
          <p className="mt-3 text-[15.5px] text-fg-muted">No crawling scripts, no vector DB to manage, no prompt engineering required.</p>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="relative flex flex-col gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-accent-soft text-accent-ink">
                <step.icon className="h-5 w-5" />
              </div>
              <span className="tabular text-[12px] font-semibold text-fg-faint">STEP {i + 1}</span>
              <h3 className="text-[16.5px] font-semibold text-fg">{step.title}</h3>
              <p className="text-[14px] leading-relaxed text-fg-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
