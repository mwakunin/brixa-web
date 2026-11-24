"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";

import type { AccountCredit } from "@/lib/cashier";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { accountKey, billKey, dueKey } from "@/hooks/use-cashier";
import { hasAction, useAwaited, useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn } from "@/lib/api/repeat-safe";
import { printedSince } from "@/lib/dates";
import { formatKes } from "@/lib/money";
import { en } from "@/strings/en";

const words = en.cashier.credit;

/** Using credit, as sent: one payment's credit, on a bill out, or on the visit's charges billed first. */
interface Using {
  encounterId: string;
  invoiceId: string | null;
  paymentId: string;
}

/** What using it led to: how much went on which bill, as the API applied it. */
interface Used {
  amountCents: number;
  invoiceNumber: string;
}

const creditAction = (encounterId: string) => `credit:${encounterId}`;

/** Whether a visit's credit has anything to show: an answer still awaited, or one not shown yet. */
export function creditToShow(encounterId: string): boolean {
  return hasAction(creditAction(encounterId));
}

/** Whether credit is being put on a visit's bill and its answer is still awaited, kept up to date. */
export function useCreditAwaited(encounterId: string): boolean {
  return useAwaited(creditAction(encounterId));
}

/**
 * Credit on the patient's account, and the press that puts it on the bill
 * (gap 19): money paid before and not yet on a bill, such as an M-Pesa
 * payment that named only the patient. One press applies the oldest
 * credit's payment (`POST /payments/{id}/allocations`), as much as it has
 * and the bill owes: the API decides how much, the screen adds nothing up.
 * Charges not billed yet are billed first (`bill-now`). Repeat-safe, with
 * the keys `<key>.bill` and `<key>.use`.
 */
export function UseCredit({ patientId, encounterId, bill, credit }: {
  patientId: string;
  encounterId: string;
  /** The bill the credit goes on, or null to bill the visit's charges first. */
  bill: { id: string; number: string } | null;
  /** The credit usable here, oldest first. */
  credit: AccountCredit[];
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const today = useBusinessDate();
  const use = useRepeatSafe<Using, Used>(creditAction(encounterId), async ({ key, body }, signal) => {
    const keyed = (part: string) => ({ [IDEMPOTENCY_HEADER]: `${key}.${part}` });
    try {
      const invoiceId = body.invoiceId ?? (await unwrap(api.POST("/encounters/{id}/bill-now", { params: { path: { id: body.encounterId } }, headers: keyed("bill"), signal }))).id;
      const payment = await unwrap(api.POST("/payments/{id}/allocations", { params: { path: { id: body.paymentId } }, body: { invoiceId }, headers: keyed("use"), signal }));
      // The one just made: the latest still standing on this bill, by when it was made, whatever order the list comes in.
      const made = payment.allocations
        .filter(allocation => allocation.invoiceId === invoiceId && allocation.reversedAt === null)
        .reduce<(typeof payment.allocations)[number] | undefined>((latest, allocation) => (!latest || allocation.allocatedAt > latest.allocatedAt ? allocation : latest), undefined);
      return { amountCents: made?.amountCents ?? 0, invoiceNumber: made?.invoiceNumber ?? "" };
    }
    finally {
      // Billed, or credit applied: what is due, the bills and the account are read again, whatever the answer.
      void queryClient.invalidateQueries({ queryKey: dueKey });
      void queryClient.invalidateQueries({ queryKey: accountKey(patientId) });
      void queryClient.invalidateQueries({ queryKey: billKey(body.encounterId) });
    }
  });
  const { state } = use;
  const waiting = waitingIn(state);
  const oldest = credit[0];

  return (
    <section aria-labelledby={id} className="flex max-w-[900px] flex-col gap-2">
      {state.kind === "done" && (
        <Alert variant="done">
          <AlertTitle>{words.used(formatKes(state.result.amountCents), state.result.invoiceNumber)}</AlertTitle>
          <AlertDescription>{words.usedHelp}</AlertDescription>
        </Alert>
      )}
      {/* A refusal shows even once no credit is left, as when another desk used it first. */}
      {state.kind === "refused" && (
        <Alert variant="problem">
          <AlertTitle>{en.writes.notDone}</AlertTitle>
          <AlertDescription>{failureText(state.error)}</AlertDescription>
        </Alert>
      )}
      {(credit.length > 0 || waiting) && (
        <>
          <h2 id={id} className="font-semibold">{words.title}</h2>
          <ul className="flex flex-col gap-0.5">
            {credit.map(entry => <li key={entry.paymentId}>{words.line(formatKes(entry.unallocatedCents), printedSince(new Date(entry.receivedAt), today))}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">{words.help}</p>
          {state.kind === "no_answer" && (
            <Alert variant="problem">
              <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
              <AlertDescription>{en.writes.noAnswer}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="second"
            className="self-start"
            disabled={state.kind === "sending" || (!waiting && !oldest)}
            onClick={() => void use.press(waiting?.body ?? { encounterId, invoiceId: bill?.id ?? null, paymentId: oldest.paymentId })}
          >
            {state.kind === "sending" ? words.using : state.kind === "no_answer" ? words.tryAgain : bill ? words.use(bill.number) : words.useVisit}
          </Button>
        </>
      )}
    </section>
  );
}
