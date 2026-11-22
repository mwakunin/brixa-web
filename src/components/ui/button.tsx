import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The desks' buttons, as the mockup's Rules board draws them. Every one is
 * at least 44 px tall, and the three a panel ends with are 56.
 *
 * - `main`: the one dark button a screen, saying what it does and where the
 *   patient goes next.
 * - `second`: a second choice, outlined, never dark.
 * - `emergency`: outlined in dark red.
 * - `quiet`: a small action in a list ("Check in").
 * - `link`: reads as a link, does what a button does.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-center transition-colors disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        main: "min-h-14 rounded-[10px] bg-primary px-5 py-2 text-lg font-bold text-primary-foreground hover:bg-primary/90 disabled:bg-primary/80",
        second: "min-h-14 rounded-[10px] border-2 border-foreground bg-card px-5 py-2 text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-60",
        emergency: "min-h-14 rounded-[10px] border-2 border-status-now bg-card px-5 py-2 text-lg font-bold text-status-now hover:bg-problem disabled:opacity-60",
        quiet: "min-h-11 rounded-lg border border-input bg-card px-4 font-semibold text-foreground hover:bg-muted disabled:opacity-60",
        link: "min-h-11 text-link underline underline-offset-2",
      },
    },
    defaultVariants: {
      variant: "main",
    },
  },
);

function Button({
  className,
  variant = "main",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
