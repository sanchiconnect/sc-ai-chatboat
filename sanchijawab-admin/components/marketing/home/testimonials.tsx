import { Quote } from "lucide-react";
import { Card } from "@/components/ui/card";

const quotes = [
  {
    body: "We went from a 20-hour response backlog to most order questions resolved before an agent ever sees them. The citations are what sold our support lead — nothing felt like a black box.",
    name: "Priya Nambiar",
    role: "Head of Support, Northwind Goods",
  },
  {
    body: "Our docs site is huge and messy. SanchiJawab indexed all of it in under ten minutes and started answering version-specific API questions correctly on day one.",
    name: "Marcus Oduya",
    role: "Founder, Veltrix Labs",
  },
  {
    body: "Admissions season used to mean 300 identical emails a week. Now the widget handles deadlines and fee questions, and our team only sees the genuinely hard cases.",
    name: "Dr. Leela Krishnan",
    role: "Admissions Director, JECRC Foundation",
  },
];

export function Testimonials() {
  return (
    <section className="border-b border-border py-20">
      <div className="container">
        <h2 className="font-display mb-14 text-center text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
          Teams that stopped repeating themselves
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {quotes.map((q) => (
            <Card key={q.name} className="flex flex-col gap-5 p-6">
              <Quote className="h-6 w-6 text-accent-soft" fill="currentColor" strokeWidth={0} />
              <p className="flex-1 text-[14.5px] leading-relaxed text-fg">{q.body}</p>
              <div>
                <p className="text-[14px] font-semibold text-fg">{q.name}</p>
                <p className="text-[13px] text-fg-muted">{q.role}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
