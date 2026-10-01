const names = ["Northwind Goods", "JECRC Foundation", "Veltrix Labs", "Harbor & Co.", "Primrose Clinic", "Stackly"];

export function LogoCloud() {
  return (
    <section className="border-b border-border py-10">
      <div className="container">
        <p className="mb-6 text-center text-[12px] font-semibold uppercase tracking-wide text-fg-faint">
          Answering visitors for teams like
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 md:grid-cols-6">
          {names.map((n) => (
            <div key={n} className="flex items-center justify-center text-center">
              <span className="font-display text-[15px] font-medium text-fg-faint">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
