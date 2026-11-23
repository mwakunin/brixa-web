"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accountKey, billKey, dueKey, useAccount } from "@/hooks/use-cashier";
import { sentBody, useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn } from "@/lib/api/repeat-safe";
import { type DueVisit, emptyWaiver, NOT_BILLED, type WaiverDraft, type WaiverField, waiverFor } from "@/lib/cashier";
import { centsFromShillings, formatKes } from "@/lib/money";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

const words = en.cashier.waiver;

/** As long as an amount and a reason the API takes. */
const LIMITS = { amount: 12, reason: 200 };

/** A waiver, as sent: on a bill already out, or on the charges not billed yet, billed first. */
interface Asking {
  encounterId: string;
  invoiceId: string | null;
  amountCents: number;
  reason: string;
}

/** What asking led to: the waiver, waiting for the in-charge, on its bill. */
interface Asked {
  amountCents: number;
  invoiceNumber: string;
}

/**
 * Asking for a waiver on the visit's bill (the walkthrough, 2026-11-20):
 * the doctor tells the cashier, the cashier asks for it on a bill with the
 * reason, and the in-charge approves it in the app, the same day. Until
 * then, it is still due.
 *
 * The bills come from the patient's account, read when the form opens
 * (audited). Charges not billed yet can be chosen: they are billed first
 * (`bill-now`, key `<key>.bill`), and the waiver asked for on that bill
 * (`<key>.ask`). Repeat-safe, as every write here.
 */
export function AskWaiver({ visit, listed, onBack, children }: {
  visit: DueVisit;
  /** The visit's row on the money due list now: null once nothing is due on it. */
  listed: DueVisit | null;
  onBack: () => void;
  /** The bill. */
  children: React.ReactNode;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const account = useAccount(visit.patient.id);
  const actionName = `waiver:${visit.encounterId}`;
  const [draft, setDraft] = useState<WaiverDraft>(() => {
    const sent = sentBody<Asking>(actionName);
    return sent ? { billId: sent.invoiceId ?? NOT_BILLED, amount: String(sent.amountCents / 100), reason: sent.reason } : emptyWaiver;
  });
  const [problems, setProblems] = useState<Partial<Record<WaiverField, string>>>({});
  const main = useRef<HTMLButtonElement>(null);

  const ask = useRepeatSafe<Asking, Asked>(actionName, async ({ key, body }, signal) => {
    const keyed = (part: string) => ({ [IDEMPOTENCY_HEADER]: `${key}.${part}` });
    const invoiceId = body.invoiceId ?? (await unwrap(api.POST("/encounters/{id}/bill-now", { params: { path: { id: body.encounterId } }, headers: keyed("bill"), signal }))).id;
    const asked = await unwrap(api.POST("/invoices/{id}/adjustments", { params: { path: { id: invoiceId } }, body: { kind: "waiver", amountCents: body.amountCents, reason: body.reason }, headers: keyed("ask"), signal }));
    // Billing what was not billed changes the visit's bills; the waiver changes nothing due until approved.
    void queryClient.invalidateQueries({ queryKey: dueKey });
    void queryClient.invalidateQueries({ queryKey: billKey(body.encounterId) });
    void queryClient.invalidateQueries({ queryKey: accountKey(visit.patient.id) });
    return { amountCents: asked.amountCents, invoiceNumber: asked.invoiceNumber ?? "" };
  });
  const { state } = ask;
  const waiting = waitingIn(state);

  // The button that pressed may be gone once an answer comes: the main one takes the keyboard's place.
  useEffect(() => {
    if (state.kind === "done" || state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  const unbilledCents = (listed ?? visit).unbilledCents;
  const bills = [
    ...(account.data?.invoices.filter(bill => bill.encounterId === visit.encounterId && bill.balanceCents > 0) ?? []).map(bill => ({ id: bill.id, label: words.billOwing(bill.number, formatKes(bill.balanceCents)), owedCents: bill.balanceCents })),
    ...(unbilledCents > 0 ? [{ id: NOT_BILLED, label: words.notBilled(formatKes(unbilledCents)), owedCents: unbilledCents }] : []),
  ];
  const shown: WaiverDraft = waiting ? { billId: waiting.body.invoiceId ?? NOT_BILLED, amount: String(waiting.body.amountCents / 100), reason: waiting.body.reason } : draft;
  // Until typed, the amount is all the chosen bill owes.
  const chosen = bills.find(bill => bill.id === shown.billId);
  const amount = shown.amount === "" && chosen && !waiting ? String(chosen.owedCents / 100) : shown.amount;
  const cents = centsFromShillings(amount);

  function change(next: Partial<WaiverDraft>) {
    setDraft(known => ({ ...known, ...next }));
    setProblems({});
  }

  async function press() {
    let ended;
    if (waiting) {
      ended = await ask.press(waiting.body);
    }
    else {
      const result = waiverFor({ ...draft, amount });
      if (!result.ok) {
        setProblems(result.problems);
        return;
      }
      setProblems({});
      ended = await ask.press({ encounterId: visit.encounterId, ...result.waiver });
    }
    // Asked for, at the first press or a Try again: the form is left empty, so the same waiver is not asked twice.
    if (ended.kind === "done")
      setDraft(emptyWaiver);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {state.kind === "done" && (
          <Alert variant="done">
            <AlertTitle>{words.asked(formatKes(state.result.amountCents), state.result.invoiceNumber)}</AlertTitle>
            <AlertDescription>{words.askedHelp}</AlertDescription>
          </Alert>
        )}
        {children}
        <fieldset disabled={waiting !== null} className="flex min-w-0 max-w-[900px] flex-col gap-4">
          <legend className="pb-1 text-lg font-semibold">{words.title}</legend>
          <p className="text-secondary-foreground">{words.intro(visit.patient.name)}</p>
          <div role="group" aria-labelledby={id} aria-describedby={problems.bill ? `${id}-problem` : undefined} className="flex flex-col gap-2">
            <p id={id} className="font-semibold">{words.which}</p>
            {account.data || unbilledCents > 0
              ? (
                  <div className="flex flex-wrap gap-2">
                    {bills.map(bill => (
                      <button
                        key={bill.id}
                        type="button"
                        aria-pressed={shown.billId === bill.id}
                        onClick={() => change({ billId: bill.id, amount: "" })}
                        className={cn(
                          "min-h-12 rounded-lg border px-[18px]",
                          shown.billId === bill.id ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted",
                          problems.bill && "border-problem-foreground",
                        )}
                      >
                        {bill.label}
                      </button>
                    ))}
                  </div>
                )
              : !account.isError && <p role="status" className="text-muted-foreground">{words.billsChecking}</p>}
            {problems.bill && <p id={`${id}-problem`} data-problem className="text-sm font-semibold text-problem-foreground">{problems.bill}</p>}
            {account.isError && (
              <Alert variant="problem">
                <AlertDescription>{words.billsReadFailed(failureText(account.error))}</AlertDescription>
                <Button variant="link" className="self-start" onClick={() => void account.refetch()}>{en.errors.tryAgain}</Button>
              </Alert>
            )}
          </div>
          <TextField
            className="w-[260px]"
            label={words.amount}
            inputMode="numeric"
            autoComplete="off"
            maxLength={LIMITS.amount}
            value={amount}
            onChange={event => change({ amount: event.target.value })}
            problem={problems.amount}
          />
          <TextField
            className="max-w-[620px]"
            label={words.reason}
            hint={words.reasonHint}
            autoComplete="off"
            maxLength={LIMITS.reason}
            value={shown.reason}
            onChange={event => change({ reason: event.target.value })}
            problem={problems.reason}
          />
        </fieldset>
      </div>
      <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
        {state.kind === "no_answer" && (
          <Alert variant="problem">
            <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
            <AlertDescription>{en.writes.noAnswer}</AlertDescription>
          </Alert>
        )}
        {state.kind === "refused" && (
          <Alert variant="problem">
            <AlertTitle>{en.writes.notDone}</AlertTitle>
            <AlertDescription>{failureText(state.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button ref={main} disabled={state.kind === "sending"} onClick={() => void press()} className="flex-[999_1_300px]">
            {state.kind === "sending" ? words.sending : state.kind === "no_answer" ? words.tryAgain : cents ? words.send(formatKes(cents)) : words.sendBare}
          </Button>
          {/* While the waiver waits for its answer, the only way on is Try again. */}
          {!waiting && <Button variant="second" onClick={onBack} className="flex-[1_1_220px]">{words.back}</Button>}
        </div>
      </div>
    </>
  );
}
