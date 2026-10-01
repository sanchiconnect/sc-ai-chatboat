import type { Metadata } from "next";
import { SolutionTemplate } from "@/components/marketing/solutions/solution-template";

export const metadata: Metadata = {
  title: "SanchiJawab for E-commerce",
  description: "Cut support tickets on order status, sizing, and returns with an AI assistant trained on your store.",
};

export default function EcommerceSolutionPage() {
  return (
    <SolutionTemplate
      content={{
        badge: "E-commerce",
        title: "Stop answering \"where's my order\" by hand",
        subtitle: "SanchiJawab indexes your product pages, sizing guides, and return policies so visitors get instant answers — and your team only sees the orders that actually need a human.",
        painPoints: [
          "Where is my order #10482?",
          "Does this run small or true to size?",
          "Can I still change my shipping address?",
          "How long do returns take to process?",
        ],
        helps: [
          { title: "Live policy answers", body: "Return windows, shipping cutoffs, and sizing charts pulled straight from your actual product and policy pages." },
          { title: "Damaged-item handoff", body: "The bot recognizes when a visitor mentions damage or a dispute and routes straight to a human, not a canned response." },
          { title: "Lead capture at checkout drop-off", body: "Catch an email or phone number from a visitor who's stuck before they abandon the cart entirely." },
        ],
        stat: { value: "63%", label: "of pre- and post-sale questions deflected, typical store" },
        quote: {
          body: "We went from a 20-hour response backlog to most order questions resolved before an agent ever sees them.",
          name: "Priya Nambiar",
          role: "Head of Support, Northwind Goods",
        },
      }}
    />
  );
}
