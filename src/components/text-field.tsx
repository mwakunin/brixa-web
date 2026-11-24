import { useId } from "react";

import { cn } from "@/lib/utils";

type InputProps = Omit<React.ComponentProps<"input">, "id" | "className">;

interface Props extends InputProps {
  label: React.ReactNode;
  hint?: string;
  /** What must be put right here, read out with the field. */
  problem?: string;
  /** The field's width and place; the input fills it. */
  className?: string;
  /** A label read as a section's heading, larger than a field's. */
  labelClassName?: string;
  /** An input read at a glance, such as a reading, larger than typed text. */
  inputClassName?: string;
}

/** A labelled input, 48 px tall, with an optional hint and problem read out with it. */
export function TextField({ label, hint, problem, className, labelClassName, inputClassName, ...input }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const describedBy = [hint && hintId, problem && problemId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("font-semibold", labelClassName)}>{label}</label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={problem ? true : undefined}
        className={cn("h-12 min-w-0 rounded-lg border border-input bg-card px-3.5 text-base text-foreground disabled:bg-muted", inputClassName, problem && "border-2 border-problem-foreground")}
        {...input}
      />
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      {problem && <p id={problemId} data-problem className="text-sm font-semibold text-problem-foreground">{problem}</p>}
    </div>
  );
}
