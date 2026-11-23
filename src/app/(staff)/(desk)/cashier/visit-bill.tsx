"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useBill, useMoneyDue } from "@/hooks/use-cashier";
import { hasAction } from "@/hooks/use-repeat-safe";
import { failureText } from "@/lib/api/refusal";
import { billLine, type DueVisit, printedQuantity, standingCharges, visitWords } from "@/lib/cashier";
import { formatKes } from "@/lib/money";
import { en } from "@/strings/en";

import { AskWaiver } from "./ask-waiver";
import { TakePayment } from "./take-payment";

const words = en.cashier;

/**
 * The row last seen for each visit opened in this tab, in memory only. A
 * payment sent there whose answer is still to show, or still awaited, is
 * found again with its patient once the visit has left the list, paid off
 * by that payment.
 */
const lastListed = new Map<string, DueVisit>();

/**
 * The patient in front of the cashier: who they are, which visit, what is
 * to pay, and the bill line by line. Their name and what is to pay stay put;
 * the bill scrolls.
 *
 * Who the patient is and what is due come from the visit's row on the money
 * due list; the lines come from the visit's charges, read once the visit is
 * known on the list. Every figure is the API's: the screen adds nothing up.
 * Under the bill, the payment is taken (`TakePayment`).
 */
export function VisitBill({ id, listed, listRead }: {
  id: string;
  /** The visit's row on the money due list now, if it is on it. */
  listed: DueVisit | null;
  /** Whether the list has been read, so a visit not on it is known to have nothing due. */
  listRead: boolean;
}) {
  // The row last seen for this visit: it still names the patient once the visit leaves the list.
  const [known, setKnown] = useState(() => listed ?? (hasAction(`pay:${id}`) ? (lastListed.get(id) ?? null) : null));
  if (listed && listed !== known)
    setKnown(listed);
  useEffect(() => {
    if (listed)
      lastListed.set(id, listed);
  }, [id, listed]);
  const visit = listed ?? known;
  const bill = useBill(id, visit !== null);
  const due = useMoneyDue();
  const today = useBusinessDate();
  const dueNow = listed !== null;
  // Asking for a waiver takes the payment's place under the bill until the cashier goes back.
  const [asking, setAsking] = useState(() => hasAction(`waiver:${id}`));

  if (!visit) {
    return (
      <section aria-label={words.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
        {listRead
          ? (
              <>
                <h1 className="text-title font-bold">{words.notDue}</h1>
                <p className="max-w-[420px] text-secondary-foreground">{words.notDueHelp}</p>
              </>
            )
          : <h1 role="status" className="text-title font-bold">{words.opening}</h1>}
      </section>
    );
  }

  const lines = bill.data ? standingCharges(bill.data.charges) : [];
  // The rest of the visit's charges were paid before, or taken off the bill.
  const partDue = bill.data !== undefined && bill.data.totalCents !== visit.dueCents;

  const billBlock = (
    <div className="flex flex-col gap-5">
      {bill.data
        ? (
            // As wide as a bill reads at a glance, however wide the screen.
            <div className="flex max-w-[900px] flex-col gap-2">
              {lines.length === 0
                ? <p className="text-secondary-foreground">{words.nothingCharged}</p>
                : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <caption className="sr-only">{words.bill}</caption>
                        <thead>
                          <tr className="border-b border-border text-sm text-muted-foreground">
                            <th scope="col" className="py-2 text-left font-semibold">{words.whatWasDone}</th>
                            <th scope="col" className="py-2 pl-4 text-right font-semibold">{words.howMany}</th>
                            <th scope="col" className="py-2 pl-4 text-right font-semibold">{words.amount}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(charge => (
                            <tr key={charge.id} className="border-b border-secondary">
                              <td className="py-2.5">{billLine(charge)}</td>
                              <td className="py-2.5 pl-4 text-right">{printedQuantity(charge.quantity)}</td>
                              <td className="py-2.5 pl-4 text-right whitespace-nowrap">{formatKes(charge.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          {partDue && (
                            <tr>
                              <th scope="row" colSpan={2} className="pt-2.5 text-left font-semibold">{words.totalForVisit}</th>
                              <td className="pt-2.5 pl-4 text-right font-semibold whitespace-nowrap">{formatKes(bill.data.totalCents)}</td>
                            </tr>
                          )}
                          {dueNow && (
                            <tr className="text-lg">
                              <th scope="row" colSpan={2} className="py-2.5 text-left">{words.toPay}</th>
                              <td className="py-2.5 pl-4 text-right font-bold whitespace-nowrap">{formatKes(visit.dueCents)}</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  )}
              {dueNow && partDue && <p className="text-sm text-muted-foreground">{words.restPaid}</p>}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-sm text-muted-foreground">{words.fromTheDesks}</p>
                {dueNow && !asking && <Button variant="link" onClick={() => setAsking(true)}>{words.waiver.ask}</Button>}
              </div>
            </div>
          )
        : !bill.isError && <p role="status" className="text-muted-foreground">{words.readingBill}</p>}
      {/* A read of the bill that failed says so, beside the lines read before when there are some. */}
      {bill.isError && (
        <Alert variant="problem">
          <AlertDescription>{words.billReadFailed(failureText(bill.error))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={() => void bill.refetch()}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
    </div>
  );

  return (
    <section aria-label={words.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-name font-bold">{visit.patient.name}</h1>
          <span className="text-secondary-foreground">
            {[visit.patient.opNumber, visitWords(visit, today)].filter(Boolean).join(" · ")}
          </span>
        </span>
        {dueNow && (
          // Beside the name, or under it at the right when the panel is narrow.
          <span className="ml-auto flex flex-col items-end">
            <span className="text-sm text-muted-foreground">{words.toPay}</span>
            <span className="text-name font-bold">{formatKes(visit.dueCents)}</span>
          </span>
        )}
      </div>
      {asking && <AskWaiver visit={visit} listed={listed} onBack={() => setAsking(false)}>{billBlock}</AskWaiver>}
      {/* Kept while the waiver is asked for, out of sight, so what was typed for the payment is there on the way back. */}
      <div hidden={asking} className="contents">
        <TakePayment
          patient={visit.patient}
          towards={{ kind: "visit", encounterId: visit.encounterId, unbilledCents: (listed ?? visit).unbilledCents }}
          dueCents={listed?.dueCents ?? null}
          dueRead={{ read: due.isSuccess, checking: due.isFetching, failed: due.isError }}
          nothingDue={{ title: words.notDue, help: words.notDueHelp }}
        >
          {!asking && billBlock}
        </TakePayment>
      </div>
    </section>
  );
}
