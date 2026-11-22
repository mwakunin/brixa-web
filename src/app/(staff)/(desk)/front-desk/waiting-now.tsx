"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { useServicePoints } from "@/hooks/use-desk";
import { failureText } from "@/lib/api/refusal";
import { en } from "@/strings/en";

/** How many are waiting at triage and at each clinic now, for telling the patient how long it may be. */
export function WaitingNow() {
  const id = useId();
  const points = useServicePoints();
  const open = points.data?.filter(point => point.isActive);
  if (!open && !points.isError)
    return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-secondary pt-4">
      <h2 id={id} className="text-lg font-semibold">{en.frontDesk.waitingNow}</h2>
      {open
        ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {open.map(point => (
                <li key={point.id} className="flex flex-col rounded-lg bg-muted px-3.5 py-3">
                  <span className="text-name font-bold">{point.waiting}</span>
                  <span className="text-sm text-secondary-foreground">{point.name}</span>
                </li>
              ))}
            </ul>
          )
        : (
            <p className="text-secondary-foreground">
              {failureText(points.error)}
              {" "}
              <Button variant="link" onClick={() => void points.refetch()}>{en.errors.tryAgain}</Button>
            </p>
          )}
    </section>
  );
}
