import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export interface LegalSection {
  heading: string;
  body: string[];
}

export function LegalTemplate({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border py-16">
          <div className="container max-w-2xl">
            <h1 className="font-display text-[32px] font-semibold tracking-tight text-fg sm:text-[38px]">{title}</h1>
            <p className="mt-2 text-[13px] text-fg-faint">Last updated {updated}</p>

            <div className="mt-6 rounded-xl2 border border-warning bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning">
              This is standard-form template content prepared for SanchiJawab&apos;s launch and has not yet been
              reviewed by qualified legal counsel. Don&apos;t treat it as a finished, binding policy until it has
              been.
            </div>

            <div className="mt-10 flex flex-col gap-8">
              {sections.map((s) => (
                <div key={s.heading}>
                  <h2 className="text-[17px] font-semibold text-fg">{s.heading}</h2>
                  <div className="mt-2 flex flex-col gap-3">
                    {s.body.map((p, i) => (
                      <p key={i} className="text-[14.5px] leading-relaxed text-fg-muted">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
