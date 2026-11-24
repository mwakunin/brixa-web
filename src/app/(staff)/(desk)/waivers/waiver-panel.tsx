"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { Adjustment } from "@/lib/waivers";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { dueKey } from "@/hooks/use-cashier";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { adjustmentsKey } from "@/hooks/use-waivers";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn } from "@/lib/api/repeat-safe";
import { printedSince } from "@/lib/dates";
import { formatKes } from "@/lib/money";
import { waiverFor } from "@/lib/waivers";
import { en } from "@/strings/en";

const words = en.waivers;

/** A decision, as sent. */
interface Deciding {
  decision: "approve" | "reject";
}

/**
 * One waiver: who it is for, how much, on which bill, who asked and why, and
 * the in-charge's decision. Deciding is repeat-safe: with no answer, the
 * decision is held and the only way on is Try again. The API refuses a
 * waiver decided by whoever asked for it (rule 24), in its own words.
 */
export function WaiverPanel({ id, adjustment, listsRead, next, onChoose }: {
  id: string;
  /** The waiver as the lists last said, null while they are read or once it has left them. */
  adjustment: Adjustment | null;
  listsRead: boolean;
  /** The next waiver waiting, to go on to once this one is decided. */
  next: Adjustment | null;
  onChoose: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const today = useBusinessDate();
  // The waiver last seen: it still shows while this desk's decision is sent, awaited or shown, as the lists are read again.
  const [known, setKnown] = useState(adjustment);
  if (adjustment && adjustment !== known)
    setKnown(adjustment);
  const main = useRef<HTMLButtonElement>(null);

  const decide = useRepeatSafe<Deciding, Adjustment>(`decide-waiver:${id}`, async ({ key, body }, signal) => {
    const request = { params: { path: { id } }, headers: { [IDEMPOTENCY_HEADER]: key }, signal };
    try {
      const decided = await unwrap(body.decision === "approve" ? api.POST("/adjustments/{id}/approve", request) : api.POST("/adjustments/{id}/reject", request));
      // An approved waiver lowers what is due at the cashier.
      void queryClient.invalidateQueries({ queryKey: dueKey });
      return decided;
    }
    finally {
      // Decided, or refused because it was withdrawn or decided meanwhile: the lists say which once read again.
      void queryClient.invalidateQueries({ queryKey: adjustmentsKey });
    }
  });
  const { state } = decide;
  const waiting = waitingIn(state);
  // Gone from both lists with nothing of this desk's to show, as when the cashier withdrew it: no longer to decide.
  const shown = adjustment ?? (state.kind === "ready" || state.kind === "refused" ? null : known);

  // The button that pressed may be gone once an answer comes: the main one takes the keyboard's place.
  useEffect(() => {
    if (state.kind === "done" || state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  if (!shown) {
    return (
      <section aria-label={words.theWaiver} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
        {listsRead
          ? (
              <>
                <h1 className="text-title font-bold">{words.notFound}</h1>
                <p className="max-w-[420px] text-secondary-foreground">{words.notFoundHelp}</p>
              </>
            )
          : <h1 role="status" className="text-title font-bold">{words.checking}</h1>}
      </section>
    );
  }

  const decided = state.kind === "done" ? state.result : null;
  const pending = shown.status === "pending" && !decided;
  const bill = shown.invoiceNumber ?? "";

  return (
    <section aria-label={words.theWaiver} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <h1 className="text-name font-bold">{waiverFor(shown)}</h1>
        {shown.patient?.opNumber && <span className="text-lg text-secondary-foreground">{shown.patient.opNumber}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {decided && (
          <Alert variant="done">
            <AlertTitle>{decided.status === "approved" ? words.approvedDone(formatKes(decided.amountCents), bill) : words.rejectedDone(bill)}</AlertTitle>
            <AlertDescription>{decided.status === "approved" ? words.approvedDoneHelp : words.rejectedDoneHelp}</AlertDescription>
          </Alert>
        )}
        <dl className="grid max-w-[900px] grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-sm text-muted-foreground">{words.toWaive}</dt>
            <dd className="text-name font-bold">{formatKes(shown.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{words.onTheBill}</dt>
            <dd className="font-semibold">{shown.invoiceTotalCents === null ? bill : words.billOf(bill, formatKes(shown.invoiceTotalCents))}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{words.askedBy}</dt>
            <dd className="font-semibold">{words.askedAt(shown.requestedByName ?? "", printedSince(new Date(shown.requestedAt), today))}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{words.why}</dt>
            <dd className="font-semibold">{shown.reason}</dd>
          </div>
        </dl>
        <details className="border-t border-secondary pt-1">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-link">{words.howItWorks}</summary>
          <div className="flex flex-col gap-2 pb-2 text-secondary-foreground">
            <p>{words.howVisit}</p>
            <p>{words.howRejected}</p>
          </div>
        </details>
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
        {pending || waiting
          ? (
              <>
                <div className="flex flex-wrap gap-3">
                  <Button
                    ref={main}
                    disabled={state.kind === "sending"}
                    onClick={() => void decide.press(waiting?.body ?? { decision: "approve" })}
                    className="flex-[999_1_300px]"
                  >
                    {state.kind === "sending" ? words.deciding : state.kind === "no_answer" ? words.tryAgain : words.approve}
                  </Button>
                  {/* While the decision waits for its answer, the only way on is Try again. */}
                  {!waiting && (
                    <Button variant="second" onClick={() => void decide.press({ decision: "reject" })} className="flex-[1_1_240px]">
                      {words.reject}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{words.notYours}</p>
              </>
            )
          : next && <Button ref={main} onClick={() => onChoose(next.id)}>{words.next(waiverFor(next))}</Button>}
      </div>
    </section>
  );
}
