import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        accent: "bg-accent-soft text-accent-ink",
        warm: "bg-warm-soft text-warm",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        muted: "bg-surface-2 text-fg-faint border border-border",
      },
    },
    defaultVariants: { variant: "accent" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
