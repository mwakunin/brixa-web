"use client";

import { useId } from "react";

import type { DueVisit } from "@/lib/cashier";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMoneyDue } from "@/hooks/use-cashier";
import { failureText } from "@/lib/api/refusal";
import { formatKes } from "@/lib/money";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

/**
 * Every open visit with money due, oldest first, each with what is due on
 * it: the cashier's queue. The amount is the API's, as it is.
 */
export function MoneyDue({ chosenId, onChoose }: { chosenId: string | null; onChoose: (visit: DueVisit) => void }) {
  const id = useId();
  const due = useMoneyDue();
  const visits = due.data;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-5">
      <h2 id={id} className="text-lg font-semibold">
        {en.cashier.moneyDue}
        {visits && <span className="font-normal text-muted-foreground">{` ${visits.length}`}</span>}
      </h2>
      {visits
        ? visits.length === 0
          ? <p className="text-secondary-foreground">{en.cashier.dueNone}</p>
          : (
              <ul className="flex flex-col gap-2">
                {visits.map((visit) => {
                  const pressed = visit.encounterId === chosenId;
                  return (
                    <li key={visit.encounterId}>
                      <button
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => onChoose(visit)}
                        className={cn(
                          "flex min-h-[60px] w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left",
                          pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className={pressed ? "font-bold" : "font-semibold"}>{visit.patient.name}</span>
                          {visit.patient.opNumber && <span className={cn("text-sm", pressed ? "text-foreground" : "text-muted-foreground")}>{visit.patient.opNumber}</span>}
                        </span>
                        <span className={cn("whitespace-nowrap", pressed ? "font-bold" : "font-semibold")}>{formatKes(visit.dueCents)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
        : !due.isError && <p role="status" className="text-muted-foreground">{en.cashier.dueChecking}</p>}
      {/* A read that failed says so, beside the list last read when there is one. */}
      {due.isError && (
        <Alert variant="problem">
          <AlertDescription>{en.cashier.dueReadFailed(failureText(due.error))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={() => void due.refetch()}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
    </section>
  );
}
