import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const faqs = [
  {
    q: "How long does the initial crawl take?",
    a: "Most sites under 2,000 pages finish in under 10 minutes. Larger sites are crawled breadth-first in the background, and the widget starts answering from whatever's indexed so far.",
  },
  {
    q: "What happens if my site changes?",
    a: "You can trigger a re-crawl manually or schedule one weekly. Only changed pages are re-chunked and re-embedded, so updates are fast.",
  },
  {
    q: "Can it hallucinate an answer that isn't on my site?",
    a: "Every answer is grounded in retrieved chunks from your own content. When nothing relevant is found, SanchiJawab says so and offers a human handoff instead of guessing.",
  },
  {
    q: "Does it support more than one language?",
    a: "Yes — the widget detects the visitor's language and responds in it, even if your source content is only in one language.",
  },
  {
    q: "Where is my data stored?",
    a: "In an isolated, workspace-scoped index on infrastructure we control. Your content is never used to train a shared model.",
  },
  {
    q: "Can I white-label this for my clients?",
    a: "Yes — our Scale plan supports multi-brand workspaces with your own domain and logo on every widget.",
  },
];

export function Faq() {
  return (
    <section className="border-b border-border bg-surface-2 py-20">
      <div className="container max-w-3xl">
        <h2 className="font-display mb-10 text-center text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
          Questions, answered (how else?)
        </h2>
        <Accordion type="single" collapsible className="rounded-xl2 border border-border bg-surface px-6">
          {faqs.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
