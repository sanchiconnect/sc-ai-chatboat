import type { Metadata } from "next";
import { SolutionTemplate } from "@/components/marketing/solutions/solution-template";

export const metadata: Metadata = {
  title: "SanchiJawab for SaaS",
  description: "Let your docs answer before a ticket opens — indexed, cited, always current.",
};

export default function SaasSolutionPage() {
  return (
    <SolutionTemplate
      content={{
        badge: "SaaS",
        title: "Let your docs answer before a ticket opens",
        subtitle: "Point SanchiJawab at your documentation, changelog, and API reference. It understands your product's actual feature names and plan limits — not generic SaaS boilerplate.",
        painPoints: [
          "How do I migrate from the v1 API?",
          "Is this feature on the free plan or do I need to upgrade?",
          "Why is my webhook not firing?",
          "What changed in the latest release?",
        ],
        helps: [
          { title: "Docs + changelog in one crawl", body: "Index your entire documentation site and changelog together, so version-specific questions get version-specific answers." },
          { title: "Plan-aware answers", body: "Because it's grounded in your real pricing page, it won't tell a free-tier user they already have an enterprise feature." },
          { title: "Documentation gap detection", body: "Recurring unanswered questions surface in your dashboard as a ready-made backlog for your docs team." },
        ],
        stat: { value: "10 min", label: "to index a full documentation site, typical" },
        quote: {
          body: "Our docs site is huge and messy. SanchiJawab indexed all of it in under ten minutes and started answering version-specific API questions correctly on day one.",
          name: "Marcus Oduya",
          role: "Founder, Veltrix Labs",
        },
      }}
    />
  );
}
