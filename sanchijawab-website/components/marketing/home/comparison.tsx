import { Check, Minus } from "lucide-react";

const rows = [
  { label: "Answers grounded in your actual content", sanchi: true, generic: false, none: false },
  { label: "Cites the exact source page", sanchi: true, generic: false, none: false },
  { label: "Re-crawls when your site changes", sanchi: true, generic: false, none: false },
  { label: "Hands off to a human when unsure", sanchi: true, generic: true, none: false },
  { label: "Live in under a day", sanchi: true, generic: true, none: true },
];

function Mark({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto h-5 w-5 text-success" />
  ) : (
    <Minus className="mx-auto h-5 w-5 text-fg-faint" />
  );
}

export function Comparison() {
  return (
    <section className="border-b border-border py-20">
      <div className="container">
        <h2 className="font-display mb-12 text-center text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
          Why not just a generic chatbot?
        </h2>
        <div className="overflow-x-auto">
          <table className="mx-auto w-full max-w-3xl border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 text-left font-medium text-fg-muted" />
                <th className="py-3 text-center font-semibold text-accent-ink">SanchiJawab</th>
                <th className="py-3 text-center font-medium text-fg-muted">Generic chatbot</th>
                <th className="py-3 text-center font-medium text-fg-muted">No chatbot</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border">
                  <td className="py-3.5 pr-4 text-fg">{r.label}</td>
                  <td className="py-3.5"><Mark value={r.sanchi} /></td>
                  <td className="py-3.5"><Mark value={r.generic} /></td>
                  <td className="py-3.5"><Mark value={r.none} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
