import type { Metadata } from "next";
import { SolutionTemplate } from "@/components/marketing/solutions/solution-template";

export const metadata: Metadata = {
  title: "SanchiJawab for Real Estate",
  description: "Qualify leads and answer listing questions while your agents are offline.",
};

export default function RealEstateSolutionPage() {
  return (
    <SolutionTemplate
      content={{
        badge: "Real estate",
        title: "Qualify leads while your agents are offline",
        subtitle: "Listing-specific questions answered straight from your own site, with qualified leads synced to your CRM — even at 9pm on a Sunday when nobody's watching the phone.",
        painPoints: [
          "Is this 2BHK still available?",
          "What's included in the maintenance fee?",
          "Can I schedule a site visit this weekend?",
          "Do you offer home loan assistance?",
        ],
        helps: [
          { title: "Per-listing accuracy", body: "Answers pull from the specific listing a visitor is browsing, not a generic FAQ that doesn't match the property." },
          { title: "Lead capture before they leave", body: "Collects contact details from an interested visitor before they bounce to a competitor's site." },
          { title: "CRM sync, not another inbox", body: "Qualified leads land directly in your existing CRM via webhook — no new tool for your agents to check." },
        ],
        stat: { value: "24/7", label: "coverage without hiring night-shift support" },
        quote: {
          body: "Half our inbound used to come in after hours when nobody could respond. Now the bot qualifies them overnight and agents follow up first thing with context already attached.",
          name: "Namma Home Services",
          role: "Property management, Bengaluru",
        },
      }}
    />
  );
}
