"use client";

import { CheckCircle2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const cases = [
  {
    key: "ecommerce",
    label: "E-commerce",
    title: "Stop answering 'where's my order' by hand",
    points: [
      "Pulls live order status pages, sizing guides, and return policies",
      "Deflects the top 5 pre-sale and post-sale questions automatically",
      "Hands off to support when a visitor mentions a damaged item",
    ],
  },
  {
    key: "saas",
    label: "SaaS",
    title: "Let your docs answer before a ticket opens",
    points: [
      "Indexes docs, changelogs, and API references in one crawl",
      "Understands feature names and plan limits specific to your product",
      "Flags recurring unanswered questions as documentation gaps",
    ],
  },
  {
    key: "education",
    label: "Education",
    title: "Admissions questions answered at 2am",
    points: [
      "Covers programs, deadlines, fees, and scholarship criteria",
      "Multilingual out of the box for international applicants",
      "Routes complex cases to the admissions office inbox",
    ],
  },
  {
    key: "realestate",
    label: "Real estate",
    title: "Qualify leads while your agents are offline",
    points: [
      "Answers listing-specific questions pulled straight from your site",
      "Captures contact details before handing off a hot lead",
      "Syncs qualified leads straight into your CRM",
    ],
  },
];

export function UseCases() {
  return (
    <section id="solutions" className="border-b border-border py-20">
      <div className="container">
        <div className="mx-auto mb-10 max-w-[52ch] text-center">
          <h2 className="font-display text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            One engine, tuned to your industry
          </h2>
        </div>

        <Tabs defaultValue="ecommerce" className="flex flex-col items-center">
          <TabsList className="flex-wrap justify-center">
            {cases.map((c) => (
              <TabsTrigger key={c.key} value={c.key}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {cases.map((c) => (
            <TabsContent key={c.key} value={c.key} className="w-full max-w-2xl">
              <h3 className="font-display mb-5 text-center text-[22px] font-semibold text-fg">{c.title}</h3>
              <ul className="flex flex-col gap-3">
                {c.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-[15px] text-fg-muted">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
