"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useBill } from "@/hooks/use-cashier";
import { failureText } from "@/lib/api/refusal";
import { billLine, type DueVisit, printedQuantity, standingCharges, visitWords } from "@/lib/cashier";
import { formatKes } from "@/lib/money";
import { en } from "@/strings/en";

import { TakePayment } from "./take-payment";

const words = en.cashier;

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
  const [known, setKnown] = useState(listed);
  if (listed && listed !== known)
    setKnown(listed);
  const visit = listed ?? known;
  const bill = useBill(id, visit !== null);
  const today = useBusinessDate();
  const due = listed !== null;

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

  return (
    <section aria-label={words.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-name font-bold">{visit.patient.name}</h1>
          <span className="text-secondary-foreground">
            {[visit.patient.opNumber, visitWords(visit, today)].filter(Boolean).join(" · ")}
          </span>
        </span>
        {due && (
          // Beside the name, or under it at the right when the panel is narrow.
          <span className="ml-auto flex flex-col items-end">
            <span className="text-sm text-muted-foreground">{words.toPay}</span>
            <span className="text-name font-bold">{formatKes(visit.dueCents)}</span>
          </span>
        )}
      </div>
      <TakePayment visit={visit} listed={listed}>
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
                              {due && (
                                <tr className="text-lg">
                                  <th scope="row" colSpan={2} className="py-2.5 text-left">{words.toPay}</th>
                                  <td className="py-2.5 pl-4 text-right font-bold whitespace-nowrap">{formatKes(visit.dueCents)}</td>
                                </tr>
                              )}
                            </tfoot>
                          </table>
                        </div>
                      )}
                  {due && partDue && <p className="text-sm text-muted-foreground">{words.restPaid}</p>}
                  <p className="text-sm text-muted-foreground">{words.fromTheDesks}</p>
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
      </TakePayment>
    </section>
  );
}
