const stats = [
  { value: "2.1s", label: "Median time to a cited answer" },
  { value: "63%", label: "Of tickets deflected, typical team" },
  { value: "380", label: "Avg. chunks indexed per site crawl" },
  { value: "99.95%", label: "Widget uptime, trailing 90 days" },
];

export function Stats() {
  return (
    <section className="border-b border-border bg-surface-2 py-14">
      <div className="container grid grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5 text-center md:text-left">
            <span className="tabular font-display text-[34px] font-semibold text-accent-ink sm:text-[40px]">
              {s.value}
            </span>
            <span className="text-[13.5px] leading-snug text-fg-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
