"use client";

import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-cashier";
import { usePatient } from "@/hooks/use-patients";
import { failureText } from "@/lib/api/refusal";
import { formatKes } from "@/lib/money";
import { fullName, opNumberOf } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

import { TakePayment } from "./take-payment";

const words = en.cashier;

/**
 * What a patient owes on bills already out, opened from the front desk:
 * each bill still owing, and the payment taken against the one chosen, the
 * oldest at first. Every figure is the API's (`GET /patients/{id}/account`).
 */
export function OwedBills({ patientId }: { patientId: string }) {
  const id = useId();
  const record = usePatient(patientId);
  const account = useAccount(patientId);
  const owing = account.data?.invoices.filter(bill => bill.balanceCents > 0) ?? [];
  // The bill chosen, the oldest owing at first; kept once paid, so its Done stays.
  const [chosenId, setChosenId] = useState<string | null>(null);
  if (chosenId === null && owing[0])
    setChosenId(owing[0].id);
  const chosen = account.data?.invoices.find(bill => bill.id === chosenId) ?? null;
  const name = record.data ? fullName(record.data) : null;
  const opNumber = record.data ? opNumberOf(record.data) : null;

  return (
    <section aria-label={words.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-name font-bold">{name ?? words.opening}</h1>
          {opNumber && <span className="text-secondary-foreground">{opNumber}</span>}
        </span>
        {account.data && account.data.owedCents > 0 && (
          <span className="ml-auto flex flex-col items-end">
            <span className="text-sm text-muted-foreground">{words.owed}</span>
            <span className="text-name font-bold">{formatKes(account.data.owedCents)}</span>
          </span>
        )}
      </div>
      {account.data && chosen && name
        ? (
            <TakePayment
              key={chosen.id}
              patient={{ id: patientId, name }}
              towards={{ kind: "bill", invoiceId: chosen.id }}
              dueCents={chosen.balanceCents > 0 ? chosen.balanceCents : null}
              dueRead={{ read: account.isSuccess, checking: account.isFetching, failed: account.isError }}
              nothingDue={{ title: words.owedBillPaid, help: words.owedBillPaidHelp }}
            >
              {owing.length > 0 && (
                <div className="flex max-w-[900px] flex-col gap-2.5">
                  <h2 id={id} className="text-lg font-semibold">{words.owedBills}</h2>
                  <ul aria-labelledby={id} className="flex flex-col gap-2">
                    {owing.map((bill) => {
                      const pressed = bill.id === chosen.id;
                      return (
                        <li key={bill.id}>
                          <button
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => setChosenId(bill.id)}
                            className={cn(
                              "flex min-h-[60px] w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left",
                              pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                            )}
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className={pressed ? "font-bold" : "font-semibold"}>{bill.number}</span>
                              <span className={cn("text-sm", pressed ? "text-foreground" : "text-muted-foreground")}>{words.owedBillLine(formatKes(bill.balanceCents), formatKes(bill.totalCents))}</span>
                            </span>
                            <span className={cn("whitespace-nowrap", pressed ? "font-bold" : "font-semibold")}>{formatKes(bill.balanceCents)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </TakePayment>
          )
        : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
              {/* Nothing owed only once the account says so; a bill owing waits for the patient's record, read beside it. */}
              {account.data && !chosen
                ? (
                    <>
                      <p className="font-semibold">{words.owedNone}</p>
                      <p className="text-secondary-foreground">{words.owedNoneHelp}</p>
                    </>
                  )
                : !account.isError && !record.isError && <p role="status" className="text-muted-foreground">{words.owedChecking}</p>}
            </div>
          )}
      {/* A read that failed says so, beside what was read before when there is some. */}
      {(account.isError || record.isError) && (
        <div className="flex-none px-6 pb-4">
          <Alert variant="problem">
            <AlertDescription>{words.owedReadFailed(failureText(account.error ?? record.error))}</AlertDescription>
            <Button
              variant="link"
              className="self-start"
              onClick={() => {
                void account.refetch();
                void record.refetch();
              }}
            >
              {en.errors.tryAgain}
            </Button>
          </Alert>
        </div>
      )}
    </section>
  );
}
