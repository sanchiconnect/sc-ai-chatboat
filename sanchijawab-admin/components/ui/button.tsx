import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-[14.5px] font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:brightness-90",
        // text-[var(--on-warm)], not text-white: dark mode's --warm stays
        // vivid for its badge pairing (components/ui/badge.tsx), which
        // fails 4.5:1 with white button text, so dark mode swaps to dark
        // ink there (see globals.css).
        warm: "bg-warm text-[color:var(--on-warm)] hover:brightness-95 shadow-card",
        ghost: "bg-surface border border-border text-fg hover:bg-surface-2",
        link: "text-accent-ink underline-offset-4 hover:underline p-0 h-auto font-medium",
        danger: "bg-danger text-[color:var(--on-danger)] hover:brightness-95",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-[52px] px-7 text-[16px]",
        icon: "h-10 w-10 shrink-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
