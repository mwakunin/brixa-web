"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import type { DueVisit } from "@/lib/cashier";

import { billKey, useMoneyDue } from "@/hooks/use-cashier";
import { idParam } from "@/lib/navigation";
import { en } from "@/strings/en";

import { MoneyDue } from "./money-due";
import { VisitBill } from "./visit-bill";
import { YourShift } from "./your-shift";

/**
 * The cashier: who has money due on the left, with the cashier's own shift
 * under it, and the patient's bill on the right.
 *
 * The visit chosen is in the address as an id, so a reload or a slow
 * connection's retry comes back to it.
 */
export function Cashier() {
  const params = useSearchParams();
  const visitId = idParam(params.get("visit"));
  const due = useMoneyDue();
  const queryClient = useQueryClient();

  function choose(visit: DueVisit) {
    // Choosing a visit is asking to see its bill now: what was read before shows while it is read again.
    void queryClient.invalidateQueries({ queryKey: billKey(visit.encounterId) });
    window.history.replaceState(null, "", `?visit=${visit.encounterId}`);
  }

  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      {/* Who has money due, and the shift: a column that scrolls on its own. */}
      <div className="flex min-h-0 w-[300px] shrink-0 flex-col gap-4 overflow-y-auto lg:w-[340px] xl:w-[380px] 2xl:w-[440px]">
        <MoneyDue chosenId={visitId} onChoose={choose} />
        <YourShift />
      </div>
      {visitId
        ? (
            <VisitBill
              key={visitId}
              id={visitId}
              listed={due.data?.find(visit => visit.encounterId === visitId) ?? null}
              listRead={due.isSuccess}
            />
          )
        : (
            <section aria-label={en.cashier.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <h1 className="text-title font-bold">{en.cashier.nobodyChosen}</h1>
              <p className="max-w-[420px] text-secondary-foreground">{en.cashier.nobodyChosenHelp}</p>
            </section>
          )}
    </main>
  );
}
