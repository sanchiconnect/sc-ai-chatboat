import { FileSearch, ShieldCheck, Palette, Users, BarChart3, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: FileSearch,
    title: "Cited, grounded answers",
    body: "Every response links back to the exact page it came from — so visitors (and you) can verify it.",
  },
  {
    icon: Users,
    title: "Human handoff",
    body: "When confidence drops or a visitor asks, route the conversation to a live agent in Slack or email.",
  },
  {
    icon: Palette,
    title: "Matches your brand",
    body: "Logo, colors, tone of voice, and placement — the widget looks like it was built in-house.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your crawled content stays in your workspace's own index. Nothing trains a shared model.",
  },
  {
    icon: BarChart3,
    title: "Real conversation analytics",
    body: "See deflection rate, unanswered questions, and the exact pages visitors needed most.",
  },
  {
    icon: Plug,
    title: "20+ integrations",
    body: "Slack, Zendesk, HubSpot, Intercom, and a documented REST API for everything else.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-border bg-surface-2 py-20">
      <div className="container">
        <div className="mx-auto mb-14 max-w-[52ch] text-center">
          <h2 className="font-display text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            Built for answers you can trust
          </h2>
          <p className="mt-3 text-[15.5px] text-fg-muted">Not a generic chatbot shell — a retrieval system with your content at the center.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="flex flex-col gap-3 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent-soft text-accent-ink">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-[16px] font-semibold text-fg">{f.title}</h3>
              <p className="text-[14px] leading-relaxed text-fg-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
