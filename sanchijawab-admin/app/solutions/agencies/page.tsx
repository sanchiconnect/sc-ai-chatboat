import type { Metadata } from "next";
import { SolutionTemplate } from "@/components/marketing/solutions/solution-template";

export const metadata: Metadata = {
  title: "SanchiJawab for Agencies",
  description: "White-label SanchiJawab across every client site you manage, from one dashboard.",
};

export default function AgenciesSolutionPage() {
  return (
    <SolutionTemplate
      content={{
        badge: "Agencies",
        title: "One dashboard, every client's bot",
        subtitle: "Stand up a branded assistant for each client site you manage, without building or maintaining your own retrieval infrastructure.",
        painPoints: [
          "Can we offer AI support as a service without building it ourselves?",
          "How do we keep each client's content and billing separate?",
          "Can this match each client's own branding, not ours?",
          "What do we tell a client who asks for usage numbers?",
        ],
        helps: [
          { title: "Per-client workspaces", body: "Each client gets their own isolated index and widget — content and conversation data never cross between accounts." },
          { title: "Branded per deployment", body: "Logo, color, and tone configured per client, so the widget looks like part of their site, not yours." },
          { title: "Usage reporting built in", body: "Hand a client real resolution-rate and conversation numbers straight from the dashboard — no manual reporting." },
        ],
        stat: { value: "15 min", label: "to stand up a new client's bot, start to install" },
        quote: {
          body: "We bill SanchiJawab into our retainer as a managed service. Clients think we built it ourselves — the branding is that seamless.",
          name: "Stackly",
          role: "Digital agency partner",
        },
      }}
    />
  );
}
