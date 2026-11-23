"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { shiftKey, useCurrentShift } from "@/hooks/use-cashier";
import { sentBody, useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { ApiError, failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn } from "@/lib/api/repeat-safe";
import type { Shift } from "@/lib/cashier";
import { printedSince } from "@/lib/dates";
import { centsFromShillings, formatKes } from "@/lib/money";
import { en } from "@/strings/en";

const words = en.cashier.shift;

/** The longest amount a cashier types: KES 20,000,000, grouped. */
const AMOUNT_MAX_LENGTH = 12;

/**
 * The cashier's own shift: what it has taken and what should be in the
 * drawer, closing it with the cash counted, or, with none open, opening one
 * with the float. Cash and card are taken inside it; every figure is the
 * API's, the expected cash and the variance included.
 */
export function YourShift() {
  const id = useId();
  const shift = useCurrentShift();
  const queryClient = useQueryClient();
  const close = useRepeatSafe<Closing, Shift>("close-shift", async ({ key, body }, signal) => {
    let closed: Shift;
    try {
      closed = await unwrap(api.POST("/cashier-shifts/{id}/close", { params: { path: { id: body.shiftId } }, body: { declaredCashCents: body.declaredCashCents }, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    }
    catch (error) {
      // Closed already, elsewhere: the shift is read again to show where it stands.
      if (error instanceof ApiError && error.refusal.kind === "refused")
        void queryClient.invalidateQueries({ queryKey: shiftKey });
      throw error;
    }
    // A read begun before the close would show the shift open, so it is stopped first. The shift read is cleared
    // only while it still shows the shift closed: a replayed answer may come after a newer shift was read.
    await queryClient.cancelQueries({ queryKey: shiftKey, exact: true });
    queryClient.setQueryData<Shift | null>(shiftKey, known => (known?.id === closed.id ? null : known));
    void queryClient.invalidateQueries({ queryKey: shiftKey });
    return closed;
  });
  const waitingClose = waitingIn(close.state);
  const done = close.state.kind === "done" ? close.state.result : null;
  // A close is shown until a shift after it has been seen: one closed elsewhere later is not this close.
  const [succeeded, setSucceeded] = useState<string | null>(null);
  if (done && shift.data && shift.data.id !== done.id && succeeded !== done.id)
    setSucceeded(done.id);
  const closed = done && shift.data === null && succeeded !== done.id ? done : null;
  // A close still waiting for its answer stays with its Try again, whatever the shift read now says.
  const closeElsewhere = waitingClose && shift.data?.id !== waitingClose.body.shiftId ? waitingClose.body.shiftId : null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-5">
      <h2 id={id} className="text-lg font-semibold">{words.title}</h2>
      {closed && <ClosedMessage shift={closed} />}
      {closeElsewhere && <CloseForm shiftId={closeElsewhere} close={close} onCancel={() => {}} />}
      {shift.data === undefined
        ? !shift.isError && <p role="status" className="text-muted-foreground">{words.checking}</p>
        : shift.data === null
          ? !closeElsewhere && <OpenShift />
          : <Takings key={shift.data.id} shift={shift.data} close={close} />}
      {/* A read that failed says so, beside the shift last read when there is one. */}
      {shift.isError && (
        <Alert variant="problem">
          <AlertDescription>{words.readFailed(failureText(shift.error))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={() => void shift.refetch()}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
    </section>
  );
}

/** What a shift closed with: the cash counted, what was expected, and the variance, as the API worked them out. */
function ClosedMessage({ shift }: { shift: Shift }) {
  const variance = shift.varianceCents ?? 0;
  return (
    <Alert variant="done">
      <AlertTitle>{words.closed}</AlertTitle>
      <AlertDescription>
        {words.closedCounts(formatKes(shift.declaredCashCents ?? 0), formatKes(shift.expectedCashCents))}
        {" "}
        {variance === 0 ? words.right : variance < 0 ? words.short(formatKes(-variance)) : words.over(formatKes(variance))}
      </AlertDescription>
    </Alert>
  );
}

interface Closing {
  shiftId: string;
  declaredCashCents: number;
}

type Close = ReturnType<typeof useRepeatSafe<Closing, Shift>>;

/** The shift open now, with what it has taken, and closing it once the drawer is counted. */
function Takings({ shift, close }: { shift: Shift; close: Close }) {
  const today = useBusinessDate();
  const waiting = waitingIn(close.state);
  // Counting the drawer opens the form; a close of this shift waiting for its answer, or refused, shows it as sent.
  const [counting, setCounting] = useState(() => sentBody<Closing>("close-shift")?.shiftId === shift.id);

  const figures = [
    { label: words.opened, value: words.openedAt(printedSince(new Date(shift.openedAt), today), formatKes(shift.openingFloatCents)) },
    { label: words.payments, value: String(shift.paymentCount) },
    { label: words.cashTaken, value: formatKes(shift.cashCents) },
    // Shown once there is some, so the drawer's figure is explained.
    ...(shift.cashRefundsCents > 0 ? [{ label: words.cashRefunded, value: formatKes(shift.cashRefundsCents) }] : []),
    { label: words.inDrawer, value: formatKes(shift.expectedCashCents) },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {figures.map(figure => (
          <div key={figure.label}>
            <dt className="text-sm text-muted-foreground">{figure.label}</dt>
            <dd className="font-semibold">{figure.value}</dd>
          </div>
        ))}
      </dl>
      {counting || waiting?.body.shiftId === shift.id
        ? <CloseForm shiftId={shift.id} close={close} onCancel={() => setCounting(false)} />
        : <Button variant="second" onClick={() => setCounting(true)} className="min-h-12 text-base">{words.close}</Button>}
    </>
  );
}

/**
 * Closing a shift with the cash counted. Repeat-safe: with no answer, the
 * count is held as sent and the button sends it again, under the same key.
 */
function CloseForm({ shiftId, close, onCancel }: { shiftId: string; close: Close; onCancel: () => void }) {
  const { state } = close;
  const waiting = waitingIn(state);
  const [typed, setTyped] = useState(() => {
    const sent = sentBody<Closing>("close-shift");
    return sent?.shiftId === shiftId ? String(sent.declaredCashCents / 100) : "";
  });
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (waiting) {
      void close.press(waiting.body);
      return;
    }
    const cents = centsFromShillings(typed);
    if (cents === null) {
      setProblem(words.countedProblem);
      return;
    }
    setProblem(null);
    void close.press({ shiftId, declaredCashCents: cents });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-secondary pt-3">
      <TextField
        label={words.counted}
        hint={words.countedHint}
        inputMode="numeric"
        autoComplete="off"
        maxLength={AMOUNT_MAX_LENGTH}
        value={waiting ? String(waiting.body.declaredCashCents / 100) : typed}
        disabled={waiting !== null}
        onChange={event => setTyped(event.target.value)}
        problem={problem ?? undefined}
      />
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="second" disabled={state.kind === "sending"} className="min-h-12 text-base">
          {state.kind === "sending" ? words.closing : state.kind === "no_answer" ? words.tryAgainClose : words.closeNow}
        </Button>
        {/* While the close waits for its answer, the only way on is Try again. */}
        {!waiting && <Button type="button" variant="link" onClick={onCancel}>{words.notNow}</Button>}
      </div>
    </form>
  );
}

interface Opening {
  openingFloatCents: number;
}

/**
 * Opening a shift with the cash counted in the drawer. Repeat-safe: with no
 * answer, the float is held as sent and the button sends it again. A refusal
 * is most often a shift opened already, elsewhere: the shift is read again to
 * show it.
 */
function OpenShift() {
  const queryClient = useQueryClient();
  const open = useRepeatSafe<Opening, Shift>("open-shift", async ({ key, body }, signal) => {
    let opened: Shift;
    try {
      opened = await unwrap(api.POST("/cashier-shifts", { body, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    }
    catch (error) {
      if (error instanceof ApiError && error.refusal.kind === "refused")
        void queryClient.invalidateQueries({ queryKey: shiftKey });
      throw error;
    }
    // A read begun before the shift opened would show none, so it is stopped first.
    await queryClient.cancelQueries({ queryKey: shiftKey, exact: true });
    queryClient.setQueryData(shiftKey, opened);
    // Read again all the same: a Try again is answered with the opening's first answer, and that shift may have closed since.
    void queryClient.invalidateQueries({ queryKey: shiftKey, exact: true });
    return opened;
  });
  const { state } = open;
  const waiting = waitingIn(state);
  // A float refused while the desk was left comes back as it was typed.
  const [typed, setTyped] = useState(() => {
    const sent = sentBody<Opening>("open-shift");
    return sent ? String(sent.openingFloatCents / 100) : "";
  });
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (waiting) {
      void open.press(waiting.body);
      return;
    }
    const cents = centsFromShillings(typed);
    if (cents === null) {
      setProblem(words.floatProblem);
      return;
    }
    setProblem(null);
    void open.press({ openingFloatCents: cents });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p className="font-semibold">{words.none}</p>
      <p className="text-sm text-secondary-foreground">{words.noneHelp}</p>
      <TextField
        label={words.float}
        inputMode="numeric"
        autoComplete="off"
        maxLength={AMOUNT_MAX_LENGTH}
        value={waiting ? String(waiting.body.openingFloatCents / 100) : typed}
        disabled={waiting !== null}
        onChange={event => setTyped(event.target.value)}
        problem={problem ?? undefined}
      />
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
      <Button type="submit" variant="second" disabled={state.kind === "sending"} className="min-h-12 text-base">
        {state.kind === "sending" ? words.opening : state.kind === "no_answer" ? words.tryAgainOpen : words.open}
      </Button>
    </form>
  );
}
