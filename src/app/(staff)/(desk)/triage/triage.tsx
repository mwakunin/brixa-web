"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { QueueEntry, TriageDraft } from "@/lib/triage";

import { useWorking } from "@/components/facility-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { servicePointsKey, useServicePoints } from "@/hooks/use-desk";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { queueKey, useQueue } from "@/hooks/use-triage";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER } from "@/lib/api/repeat-safe";
import { idParam } from "@/lib/navigation";
import { ageWords, emptyTriage, waitingWords } from "@/lib/triage";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

import { type Sent, TriageForm } from "./triage-form";

const words = en.triage;

/** The time now, a minute at a time: how long each patient has waited moves on by itself. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Sex and age, as a queue row says them. */
function sexAndAge(entry: QueueEntry): string[] {
  return [entry.patient.sex ? en.patients.sex[entry.patient.sex] : words.sexNotKnown, ageWords(entry.patient.ageYears)];
}

/**
 * Triage: who is waiting on the left, by arrival, and the patient with the
 * nurse on the right, with one dark button that saves the triage and sends
 * them on (`../api/SPEC.md` §7.9).
 *
 * The patient with this nurse is the queue's entry served by their own
 * membership here. Several may be; the one chosen is in the address as an
 * id. What is typed for each is kept here, so calling in another and coming
 * back loses nothing.
 */
export function Triage() {
  const { facility } = useWorking();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const chosenId = idParam(params.get("entry"));
  const points = useServicePoints();
  const triagePoint = points.data?.find(point => point.kind === "triage" && point.isActive) ?? null;
  const queue = useQueue(triagePoint?.id ?? null);
  const entries = queue.data?.entries ?? [];
  const mine = entries.filter(entry => entry.status === "serving" && entry.servedBy?.membershipId === facility.membershipId);
  const others = entries.filter(entry => entry.status === "serving" && entry.servedBy?.membershipId !== facility.membershipId);
  const waiting = entries.filter(entry => entry.status === "waiting");
  const withYou = mine.find(entry => entry.entryId === chosenId) ?? mine[0] ?? null;
  const clinics = points.data?.filter(point => point.kind === "consultation" && point.isActive) ?? [];
  const [drafts, setDrafts] = useState<Record<string, TriageDraft>>({});
  // The patient last sent on from here: their Done shows until the next is called in.
  const [sent, setSent] = useState<Sent | null>(null);

  function called(entryId: string) {
    setSent(null);
    if (triagePoint)
      void queryClient.invalidateQueries({ queryKey: queueKey(triagePoint.id) });
    window.history.replaceState(null, "", `?entry=${entryId}`);
  }

  function sentOn(done: Sent) {
    setSent(done);
    setDrafts(known => Object.fromEntries(Object.entries(known).filter(([entryId]) => entryId !== done.entryId)));
    if (triagePoint)
      void queryClient.invalidateQueries({ queryKey: queueKey(triagePoint.id) });
    // The clinics' counts have changed.
    void queryClient.invalidateQueries({ queryKey: servicePointsKey });
    window.history.replaceState(null, "", window.location.pathname);
  }

  if (points.data && !triagePoint) {
    return (
      <main className="flex min-h-0 w-full flex-1 px-6 py-4">
        <section aria-label={words.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-title font-bold">{words.noTriage}</h1>
          <p className="max-w-[420px] text-secondary-foreground">{words.noTriageHelp}</p>
        </section>
      </main>
    );
  }

  const showSent = sent !== null && (withYou === null || withYou.entryId === sent.entryId);
  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      <QueueList
        mine={mine}
        others={others}
        waiting={waiting}
        withYouId={withYou?.entryId ?? null}
        read={queue.isSuccess}
        failure={queue.error ?? points.error}
        onRetry={() => {
          void points.refetch();
          void queue.refetch();
        }}
        onChoose={entryId => window.history.replaceState(null, "", `?entry=${entryId}`)}
        onCalled={called}
        nextId={showSent ? (waiting[0]?.entryId ?? null) : null}
      />
      {showSent
        ? <SentPanel sent={sent} next={waiting[0] ?? null} onCalled={called} />
        : withYou
          ? (
              <TriageForm
                key={withYou.entryId}
                entry={withYou}
                clinics={clinics}
                clinicsRead={points.isSuccess}
                draft={drafts[withYou.entryId] ?? emptyTriage}
                setDraft={update => setDrafts(known => ({ ...known, [withYou.entryId]: update(known[withYou.entryId] ?? emptyTriage) }))}
                onSent={sentOn}
              />
            )
          : (
              <section aria-label={words.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
                <h1 className="text-title font-bold">{words.nobodyWithYou}</h1>
                <p className="max-w-[420px] text-secondary-foreground">{words.nobodyWithYouHelp}</p>
              </section>
            )}
    </main>
  );
}

/** The queue: the patients with this nurse, those with other staff, and those waiting, each with Call in. */
function QueueList({ mine, others, waiting, withYouId, read, failure, onRetry, onChoose, onCalled, nextId }: {
  mine: QueueEntry[];
  others: QueueEntry[];
  waiting: QueueEntry[];
  withYouId: string | null;
  read: boolean;
  failure: unknown;
  onRetry: () => void;
  onChoose: (entryId: string) => void;
  onCalled: (entryId: string) => void;
  /** The patient offered next, once one was sent on. */
  nextId: string | null;
}) {
  const id = useId();
  const now = useNow();
  return (
    <section aria-label={words.queue} className="flex min-h-0 w-[300px] shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-5 lg:w-[320px] xl:w-[360px] 2xl:w-[400px]">
      <h2 className="text-lg font-semibold">{words.withYou}</h2>
      {mine.length === 0
        ? <p className="text-muted-foreground">{words.nobody}</p>
        : (
            <ul className="flex flex-col gap-2">
              {mine.map((entry) => {
                const pressed = entry.entryId === withYouId;
                return (
                  <li key={entry.entryId}>
                    <button
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => onChoose(entry.entryId)}
                      className={cn(
                        "flex min-h-[60px] w-full flex-col justify-center rounded-lg border px-3.5 py-2.5 text-left",
                        pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                      )}
                    >
                      <span className={pressed ? "font-bold" : "font-semibold"}>{entry.patient.name}</span>
                      <span className={cn("text-sm", pressed ? "text-foreground" : "text-muted-foreground")}>{[entry.patient.opNumber, ...sexAndAge(entry)].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      <h2 id={id} className="pt-2 text-lg font-semibold">
        {words.waiting}
        {read && <span className="font-normal text-muted-foreground">{` ${waiting.length}`}</span>}
      </h2>
      {read
        ? waiting.length === 0
          ? <p className="text-secondary-foreground">{words.noneWaiting}</p>
          : (
              <ul aria-labelledby={id} className="flex flex-col gap-2">
                {waiting.map(entry => (
                  <li key={entry.entryId} className={cn("flex flex-col gap-2 rounded-lg border px-3.5 py-2.5", entry.entryId === nextId ? "border-2 border-selected" : "border-border")}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-col">
                        <span className={entry.entryId === nextId ? "font-bold" : "font-semibold"}>{entry.patient.name}</span>
                        <span className="text-sm text-muted-foreground">{[...sexAndAge(entry), waitingWords(entry.joinedAt, now)].join(" · ")}</span>
                        {entry.entryId === nextId && <span className="text-sm font-bold text-link">{words.next}</span>}
                      </span>
                      <CallIn entry={entry} onCalled={onCalled} />
                    </span>
                  </li>
                ))}
              </ul>
            )
        : !failure && <p role="status" className="text-muted-foreground">{words.checking}</p>}
      {others.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">{words.withOthers}</h2>
          <ul className="flex flex-col gap-1">
            {others.map(entry => (
              <li key={entry.entryId} className="text-secondary-foreground">
                {[entry.patient.name, entry.servedBy ? words.withOther(entry.servedBy.name) : null].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {/* A read that failed says so, beside the queue last read when there is one. */}
      {failure !== null && (
        <Alert variant="problem">
          <AlertDescription>{words.readFailed(failureText(failure))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={onRetry}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
    </section>
  );
}

/**
 * Calling a patient in (`POST /queue-entries/{id}/serve`): they are then
 * with this nurse. Repeat-safe: with no answer, the press sends it again
 * under the same key.
 */
function useCallIn(entry: QueueEntry, onCalled: (entryId: string) => void) {
  const call = useRepeatSafe<{ entryId: string }, null>(`serve:${entry.entryId}`, async ({ key, body }, signal) => {
    await unwrap(api.POST("/queue-entries/{id}/serve", { params: { path: { id: body.entryId } }, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    return null;
  });
  async function press() {
    const ended = await call.press({ entryId: entry.entryId });
    if (ended.kind === "done")
      onCalled(entry.entryId);
  }
  return { state: call.state, press };
}

function CallIn({ entry, onCalled }: { entry: QueueEntry; onCalled: (entryId: string) => void }) {
  const { state, press } = useCallIn(entry, onCalled);
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Button variant="quiet" aria-label={state.kind === "ready" || state.kind === "done" ? words.callInWho(entry.patient.name) : undefined} disabled={state.kind === "sending"} onClick={() => void press()}>
        {state.kind === "sending" ? words.callingIn : state.kind === "no_answer" ? words.tryAgainCallIn : words.callIn}
      </Button>
      {state.kind === "refused" && <span role="alert" className="max-w-[220px] text-right text-sm font-semibold text-problem-foreground">{failureText(state.error)}</span>}
    </span>
  );
}

/** After a patient is sent on: their Done, and the next patient waiting, to call in with the one dark button. */
function SentPanel({ sent, next, onCalled }: { sent: Sent; next: QueueEntry | null; onCalled: (entryId: string) => void }) {
  return (
    <section aria-label={words.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <h1 className="text-name font-bold">{next ? words.nextWho(next.patient.name) : words.nobodyWithYou}</h1>
        {next && <span className="text-lg text-secondary-foreground">{[...sexAndAge(next), waitingWords(next.joinedAt, new Date())].join(" · ")}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <Alert variant="done">
          <AlertTitle>{words.sent(sent.name, sent.clinic, words.priorityAs[sent.priority])}</AlertTitle>
          <AlertDescription>{words.savedAt(sent.savedAt)}</AlertDescription>
        </Alert>
        <p className="text-secondary-foreground">{next ? words.nextHelp(next.patient.name) : words.nobodyNext}</p>
      </div>
      {next && (
        <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
          <CallInNext entry={next} onCalled={onCalled} />
        </div>
      )}
    </section>
  );
}

function CallInNext({ entry, onCalled }: { entry: QueueEntry; onCalled: (entryId: string) => void }) {
  const { state, press } = useCallIn(entry, onCalled);
  return (
    <>
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
      <Button disabled={state.kind === "sending"} onClick={() => void press()}>
        {state.kind === "sending" ? words.callingIn : state.kind === "no_answer" ? words.tryAgainCallIn : words.callInWho(entry.patient.name)}
      </Button>
    </>
  );
}
