import { cn } from "@/lib/utils";

/**
 * Mark reads as three crawled pages converging into one answer dot —
 * deliberately not a speech-bubble, to avoid the generic "AI chat" cliche.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("h-8 w-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M9 11.5 L16 16 L9 20.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M16 9 L16 16 L16 23" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <path d="M23 11.5 L16 16 L23 20.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx="16" cy="16" r="2.6" fill="white" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[19px] font-semibold tracking-tight text-fg">SanchiJawab</span>
    </span>
  );
}
