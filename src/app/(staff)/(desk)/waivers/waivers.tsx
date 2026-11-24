"use client";

import { Check, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId } from "react";

import type { Adjustment } from "@/lib/waivers";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useRecentAdjustments, useWaitingAdjustments } from "@/hooks/use-waivers";
import { failureText } from "@/lib/api/refusal";
import { printedSince } from "@/lib/dates";
import { formatKes } from "@/lib/money";
import { idParam } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { decidedToday, waitingWaivers, waiverFor } from "@/lib/waivers";
import { en } from "@/strings/en";

import { WaiverPanel } from "./waiver-panel";

const words = en.waivers;

/**
 * The in-charge's waivers: those waiting on the left, the longest waiting
 * first, with today's decisions under them, and the one chosen on the
 * right. The waiver chosen is in the address as an id.
 */
export function Waivers() {
  const params = useSearchParams();
  const chosenId = idParam(params.get("waiver"));
  const waiting = useWaitingAdjustments();
  const recent = useRecentAdjustments();
  const today = useBusinessDate();
  const queue = waiting.data ? waitingWaivers(waiting.data) : null;
  // The chosen waiver, wherever it is now: still waiting, or decided.
  const chosen = [...(waiting.data ?? []), ...(recent.data ?? [])].find(adjustment => adjustment.id === chosenId) ?? null;

  function choose(id: string) {
    window.history.replaceState(null, "", `?waiver=${id}`);
  }

  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      <WaiverList queue={queue} decided={recent.data ? decidedToday(recent.data, today) : []} chosenId={chosenId} onChoose={choose} />
      {chosenId
        ? (
            <WaiverPanel
              key={chosenId}
              id={chosenId}
              adjustment={chosen}
              listsRead={waiting.isSuccess && recent.isSuccess}
              next={queue?.find(adjustment => adjustment.id !== chosenId) ?? null}
              onChoose={choose}
            />
          )
        : (
            <section aria-label={words.theWaiver} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <h1 className="text-title font-bold">{queue?.length === 0 ? words.noneWaiting : words.noneChosen}</h1>
              <p className="max-w-[420px] text-secondary-foreground">{queue?.length === 0 ? words.noneWaitingHelp : words.noneChosenHelp}</p>
            </section>
          )}
    </main>
  );
}

function WaiverList({ queue, decided, chosenId, onChoose }: {
  queue: Adjustment[] | null;
  decided: Adjustment[];
  chosenId: string | null;
  onChoose: (id: string) => void;
}) {
  const id = useId();
  const today = useBusinessDate();
  const waiting = useWaitingAdjustments();
  const recent = useRecentAdjustments();
  const failed = waiting.error ?? recent.error;
  return (
    <section aria-labelledby={id} className="flex min-h-0 w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-5 lg:w-[340px] xl:w-[380px] 2xl:w-[440px]">
      <h2 id={id} className="text-lg font-semibold">
        {words.waiting}
        {queue && <span className="font-normal text-muted-foreground">{` ${queue.length}`}</span>}
      </h2>
      {queue
        ? queue.length === 0
          ? <p className="text-secondary-foreground">{words.noneWaiting}</p>
          : (
              <ul className="flex flex-col gap-2">
                {queue.map((adjustment) => {
                  const pressed = adjustment.id === chosenId;
                  return (
                    <li key={adjustment.id}>
                      <button
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => onChoose(adjustment.id)}
                        className={cn(
                          "flex min-h-[60px] w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left",
                          pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className={pressed ? "font-bold" : "font-semibold"}>{waiverFor(adjustment)}</span>
                          <span className={cn("text-sm", pressed ? "text-foreground" : "text-muted-foreground")}>
                            {words.rowLine(adjustment.invoiceNumber ?? "", printedSince(new Date(adjustment.requestedAt), today))}
                          </span>
                        </span>
                        <span className={cn("whitespace-nowrap", pressed ? "font-bold" : "font-semibold")}>{formatKes(adjustment.amountCents)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
        : !failed && <p role="status" className="text-muted-foreground">{words.checking}</p>}
      {decided.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">
            {words.decidedToday}
            <span className="font-normal text-muted-foreground">{` ${decided.length}`}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {decided.map(adjustment => (
              <li key={adjustment.id} className="flex min-h-[60px] items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-semibold">{waiverFor(adjustment)}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <Badge kind="desk">
                      {adjustment.status === "approved" ? <Check aria-hidden="true" strokeWidth={2.5} /> : <X aria-hidden="true" strokeWidth={2.5} />}
                      {adjustment.status === "approved" ? words.approved : words.rejected}
                    </Badge>
                    {words.decidedBy(adjustment.decidedByName ?? "", printedSince(new Date(adjustment.decidedAt ?? adjustment.requestedAt), today))}
                  </span>
                </span>
                <span className="font-semibold whitespace-nowrap">{formatKes(adjustment.amountCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* A read that failed says so, beside the lists last read when there are some. */}
      {failed && (
        <Alert variant="problem">
          <AlertDescription>{words.readFailed(failureText(failed))}</AlertDescription>
          <Button
            variant="link"
            className="self-start"
            onClick={() => {
              void waiting.refetch();
              void recent.refetch();
            }}
          >
            {en.errors.tryAgain}
          </Button>
        </Alert>
      )}
    </section>
  );
}
