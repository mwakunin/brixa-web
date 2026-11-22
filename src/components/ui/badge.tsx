import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A status, in the four kinds of the mockup's Rules board. The word always
 * says it; the colour, the icon and how light or dark the badge is only help
 * find it, so the kinds never look alike. The icon comes with the word.
 *
 * - `now` (Act now): a critical result, an emergency. Dark red, a warning sign.
 * - `soon` (Soon): how soon a patient must be seen. Orange, a clock.
 * - `range` (Outside the usual range): a result outside its range. Pale amber.
 * - `desk` (For your desk's work): money, stock and records. White, a grey
 *   outline, a tick when done, a box for stock.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-sm whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      kind: {
        now: "bg-status-now font-bold text-status-now-foreground",
        soon: "bg-status-soon font-bold text-status-soon-foreground",
        range: "border border-status-range-border bg-status-range font-bold text-status-range-foreground",
        desk: "border border-status-desk-border bg-status-desk font-semibold text-status-desk-foreground",
      },
    },
  },
);

function Badge({ className, kind, ...props }: React.ComponentProps<"span"> & { kind: "now" | "soon" | "range" | "desk" }) {
  return <span data-slot="badge" className={cn(badgeVariants({ kind }), className)} {...props} />;
}

export { Badge };
