import { cva } from "class-variance-authority";
import { CircleCheck, CircleX } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The three messages of the mockup's Rules board. None vanishes on a timer:
 * a message gone after a few seconds is missed.
 *
 * - `done`: stays in the panel until the next patient. Announced politely.
 * - `problem` ("Not done"): beside the main button, with the API's message
 *   as it is. Announced at once.
 * - `caution` ("Check this"): asks for a decision before going on.
 */
const alertVariants = cva(
  "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left",
  {
    variants: {
      variant: {
        done: "border-done-border bg-done text-done-foreground",
        problem: "border-problem-border bg-problem text-problem-foreground",
        caution: "border-2 border-caution-border bg-caution text-caution-foreground",
      },
    },
  },
);

const roles = { done: "status", problem: "alert", caution: undefined } as const;
const icons = { done: CircleCheck, problem: CircleX, caution: null } as const;

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & { variant: keyof typeof roles }) {
  const Icon = icons[variant];
  return (
    <div data-slot="alert" role={roles[variant]} className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon && <Icon aria-hidden="true" className="size-[22px] shrink-0" strokeWidth={2.5} />}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"strong">) {
  return <strong data-slot="alert-title" className={cn("font-bold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={className} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
