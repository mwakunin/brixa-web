import { useId } from "react";

type InputProps = Omit<React.ComponentProps<"input">, "id" | "className">;

/** A labelled input, 48 px tall, with an optional hint read out with it. */
export function TextField({ label, hint, ...input }: InputProps & { label: string; hint?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className="h-12 rounded-lg border border-input bg-card px-3.5 text-base text-foreground"
        {...input}
      />
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
