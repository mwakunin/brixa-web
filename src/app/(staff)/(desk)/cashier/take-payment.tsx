"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useWorking } from "@/components/facility-gate";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { accountKey, billKey, dueKey, shiftKey, unmatchedKey, useCurrentShift, usePayment, usePrompt, useUnmatchedPayments } from "@/hooks/use-cashier";
import { usePatient } from "@/hooks/use-patients";
import { sentBody, useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { ApiError, failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn, type WriteState } from "@/lib/api/repeat-safe";
import { emptyPayment, matchingPayments, type Paying, type PaymentDraft, type PaymentField, paymentFieldProblem, payingFor } from "@/lib/cashier";
import { printedSince } from "@/lib/dates";
import { desksFor } from "@/lib/desks";
import { documentFailureText, documentTab, openDocument } from "@/lib/documents";
import { centsFromShillings, formatKes } from "@/lib/money";
import { printedPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

const words = en.cashier.pay;

/** As long as a reference, a phone or an amount the API takes. */
const LIMITS = { amount: 12, phone: 16, reference: 40, find: 20 };

/** What a payment is taken towards: a visit, whose charges not billed yet are billed first, or one bill already out. */
export type Towards
  = | { kind: "visit"; encounterId: string; unbilledCents: number }
    | { kind: "bill"; invoiceId: string };

/** The repeat-safe action of a payment towards a visit or a bill, by its id: found again by any screen that shows it. */
export function paymentAction(kind: Towards["kind"], id: string): string {
  return kind === "visit" ? `pay:${id}` : `pay:bill:${id}`;
}

/** One payment, as sent: billing what is not billed yet first, when there is some. */
interface Pay {
  patientId: string;
  towards: { encounterId: string } | { invoiceId: string };
  bill: boolean;
  paying: Paying;
}

/**
 * What a payment led to: a receipt; an M-Pesa payment placed on the
 * account whose receipt could not be read with it, and is read again; or a
 * prompt the patient has yet to pay on their phone.
 */
type Paid
  = | { kind: "paid"; receiptNumber: string; documentId: string; amountCents: number }
    | { kind: "placed"; paymentId: string }
    | { kind: "prompted"; promptId: string; phone: string; amountCents: number };

/** The form a payment was sent from, for a screen shown again while it waits, or after a refusal. */
function draftOf(sent: Pay | null): PaymentDraft {
  if (!sent)
    return emptyPayment;
  const { paying } = sent;
  const amount = String(paying.amountCents / 100);
  switch (paying.method) {
    case "paybill": return { ...emptyPayment, transactionId: paying.transactionId };
    case "prompt": return { ...emptyPayment, method: "prompt", amount, phone: paying.phone };
    case "cash": return { ...emptyPayment, method: "cash", amount };
    default: return { ...emptyPayment, method: "card_or_bank", cardOrBank: paying.method, amount, reference: paying.reference };
  }
}

/** A phone as M-Pesa gives it (`254712345678`), as staff read it. */
function payerPhone(msisdn: string): string {
  return /^\d+$/.test(msisdn) ? printedPhone(`+${msisdn}`) : msisdn;
}

/**
 * Taking a payment for what the panel shows: how the patient pays, then
 * one dark button that records it and prints the receipt. M-Pesa paid to
 * the paybill comes first, then a prompt to the phone, cash, and card or
 * bank. Paying part is fine: the rest stays due.
 *
 * One press is one repeat-safe action. For a visit, charges not billed yet
 * are billed first (`bill-now`), then the payment is taken towards the
 * visit, which settles its bills oldest first; for a bill already out, it
 * is taken against that bill. Each request carries the action's key with
 * its own suffix. With no answer, what was sent is held, and the only way
 * on is Try again.
 *
 * The receipt opens in a tab opened at the press, so the browser lets it
 * through. A prompt is paid on the patient's phone, so its receipt is
 * printed from the Done message once it is.
 */
export function TakePayment({ patient, towards, dueCents, dueRead, nothingDue, held = false, onPromptOpen, children }: {
  patient: { id: string; name: string };
  towards: Towards;
  /** What is due now, as the API last said: null once nothing is. */
  dueCents: number | null;
  /** How the read that says what is due stands, so a payment's Done waits for it to be read again. */
  dueRead: { read: boolean; checking: boolean; failed: boolean };
  /** What to say when nothing is due here any more, though nothing was paid here. */
  nothingDue: { title: string; help: string };
  /**
   * Credit is being put on this bill and its answer is awaited: what is due
   * may already be less, so no new payment is taken until it comes.
   */
  held?: boolean;
  /** Told whether a prompt for this bill is open on the patient's phone, for credit to wait on it. */
  onPromptOpen?: (open: boolean) => void;
  /** The bill. */
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const shift = useCurrentShift();
  const name = patient.name;
  const actionName = paymentAction(towards.kind, towards.kind === "visit" ? towards.encounterId : towards.invoiceId);
  const [draft, setDraft] = useState<PaymentDraft>(() => draftOf(sentBody<Pay>(actionName)));
  // Until the amount is typed, it is what is due.
  const [amountTyped, setAmountTyped] = useState(() => sentBody<Pay>(actionName) !== null);
  const [problems, setProblems] = useState<Partial<Record<PaymentField, string>>>({});
  const [printProblem, setPrintProblem] = useState<string | null>(null);
  // The receipt's tab, opened at the press, and whether that press asked for a receipt.
  const tab = useRef<Window | null>(null);
  const receiptWanted = useRef(false);
  const main = useRef<HTMLButtonElement>(null);

  const pay = useRepeatSafe<Pay, Paid>(actionName, async ({ key, body }, signal) => {
    const keyed = (part: string) => ({ [IDEMPOTENCY_HEADER]: `${key}.${part}` });
    if (body.bill && "encounterId" in body.towards) {
      try {
        await unwrap(api.POST("/encounters/{id}/bill-now", { params: { path: { id: body.towards.encounterId } }, headers: keyed("bill"), signal }));
      }
      catch (error) {
        // Billed already, from another desk: what is due is on its bills, and the payment settles them.
        if (!(error instanceof ApiError && error.refusal.kind === "refused" && error.refusal.code === "nothing_to_bill"))
          throw error;
      }
    }
    const { paying } = body;
    const towards = { patientId: body.patientId, ...body.towards };
    let paid: Paid;
    if (paying.method === "prompt") {
      const prompt = await unwrap(api.POST("/mpesa/stk", { body: { ...towards, phone: paying.phone, amountCents: paying.amountCents }, headers: keyed("pay"), signal }));
      paid = { kind: "prompted", promptId: prompt.id, phone: paying.phone, amountCents: prompt.amountCents };
    }
    else if (paying.method === "paybill") {
      const placed = await unwrap(api.POST("/mpesa/transactions/{id}/assign", { params: { path: { id: paying.transactionId } }, body: towards, headers: keyed("pay"), signal }));
      if (!placed.paymentId)
        throw new Error("A placed M-Pesa payment came back without its payment");
      void queryClient.invalidateQueries({ queryKey: unmatchedKey });
      try {
        const payment = await unwrap(api.GET("/payments/{id}", { params: { path: { id: placed.paymentId } }, signal }));
        paid = { kind: "paid", receiptNumber: payment.receiptNumber, documentId: payment.documentId, amountCents: payment.amountCents };
      }
      catch {
        // Placed: the payment is done whatever this read says. Its receipt is read again on the screen, with its own Try again.
        paid = { kind: "placed", paymentId: placed.paymentId };
      }
    }
    else {
      const reference = paying.method === "cash" ? {} : { reference: paying.reference };
      const payment = await unwrap(api.POST("/payments", { body: { ...towards, method: paying.method, amountCents: paying.amountCents, ...reference }, headers: keyed("pay"), signal }));
      void queryClient.invalidateQueries({ queryKey: shiftKey });
      paid = { kind: "paid", receiptNumber: payment.receiptNumber, documentId: payment.documentId, amountCents: payment.amountCents };
    }
    // What is due, the bills behind it and the patient's account have changed: they are read again.
    void queryClient.invalidateQueries({ queryKey: dueKey });
    void queryClient.invalidateQueries({ queryKey: accountKey(body.patientId) });
    if ("encounterId" in body.towards)
      void queryClient.invalidateQueries({ queryKey: billKey(body.towards.encounterId) });
    return paid;
  });
  const { state } = pay;
  const waiting = waitingIn(state);
  const prompted = state.kind === "done" && state.result.kind === "prompted" ? state.result : null;
  const placed = state.kind === "done" && state.result.kind === "placed" ? state.result : null;
  const prompt = usePrompt(prompted?.promptId ?? null);
  const promptStatus = prompt.data?.status;
  // A payment recorded without its receipt: paid on the phone, or placed while the receipt's read failed.
  const laterPayment = usePayment(placed?.paymentId ?? (promptStatus === "completed" ? (prompt.data?.paymentId ?? null) : null));
  const promptOpen = prompted !== null && promptStatus !== "completed" && promptStatus !== "failed";

  // The receipt goes to the tab opened at the press, and says so when the browser blocked it; a press that ended
  // any other way leaves the tab nothing to show.
  useEffect(() => {
    if (state.kind === "sending" || !receiptWanted.current)
      return;
    receiptWanted.current = false;
    const opened = tab.current;
    tab.current = null;
    if (state.kind === "done" && state.result.kind === "paid")
      openDocument(state.result.documentId, opened).catch(error => setPrintProblem(documentFailureText(error)));
    else
      opened?.close();
  }, [state]);
  // A tab still waiting when the bill is left has nothing coming.
  useEffect(() => () => tab.current?.close(), []);

  // A prompt paid on the phone changes what is due.
  const visitId = towards.kind === "visit" ? towards.encounterId : null;
  useEffect(() => {
    if (promptStatus !== "completed")
      return;
    void queryClient.invalidateQueries({ queryKey: dueKey });
    void queryClient.invalidateQueries({ queryKey: accountKey(patient.id) });
    if (visitId)
      void queryClient.invalidateQueries({ queryKey: billKey(visitId) });
  }, [promptStatus, queryClient, patient.id, visitId]);

  // The button that pressed may be gone once an answer comes: the main one takes the keyboard's place.
  useEffect(() => {
    if (state.kind === "done" || state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  // While a prompt is open, or its request is sent and unanswered (it may be on the phone already), credit on this bill
  // waits: the prompt may yet pay what the credit would.
  const promptAsked = promptOpen || waiting?.body.paying.method === "prompt";
  useEffect(() => {
    onPromptOpen?.(promptAsked);
    return () => onPromptOpen?.(false);
  }, [promptAsked, onPromptOpen]);

  const shown = waiting ? draftOf(waiting.body) : draft;
  const amount = amountTyped || waiting ? shown.amount : dueCents !== null ? String(dueCents / 100) : "";
  const unmatched = useUnmatchedPayments(dueCents !== null && shown.method === "paybill");
  const chosenPayment = unmatched.data?.find(payment => payment.id === shown.transactionId) ?? null;
  const needsShift = (shown.method === "cash" || (shown.method === "card_or_bank" && shown.cardOrBank === "card")) && shift.data === null;
  // The patient's phone, from their record, read when a prompt is chosen.
  const record = usePatient(patient.id, shown.method === "prompt");
  const filePhone = record.data?.phone ? printedPhone(record.data.phone) : "";
  const [phoneTyped, setPhoneTyped] = useState(() => sentBody<Pay>(actionName) !== null);
  const phone = phoneTyped || waiting ? shown.phone : filePhone;

  function change(next: Partial<PaymentDraft>) {
    setDraft(known => ({ ...known, ...next }));
    setProblems({});
  }

  /** A payment taken leaves the form for the next, by the same way; a refusal naming a field shows at that field, in our words. */
  function answered(ended: WriteState<Pay, Paid>) {
    if (ended.kind === "done") {
      setDraft(known => ({ ...emptyPayment, method: known.method, cardOrBank: known.cardOrBank }));
      setAmountTyped(false);
      setPhoneTyped(false);
      return;
    }
    if (ended.kind !== "refused" || !(ended.error instanceof ApiError) || ended.error.refusal.kind !== "invalid")
      return;
    const found = ended.error.refusal.issues.map(issue => paymentFieldProblem(issue.path)).filter(field => field !== null);
    setProblems(Object.fromEntries(found.map(({ field, problem }) => [field, problem])));
  }

  async function press() {
    if (waiting) {
      if (waiting.body.paying.method !== "prompt") {
        receiptWanted.current = true;
        tab.current = documentTab();
      }
      answered(await pay.press(waiting.body));
      return;
    }
    const result = payingFor({ ...draft, amount, phone }, chosenPayment?.amountCents ?? null);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    setProblems({});
    setPrintProblem(null);
    // Opened now, while the press counts as the cashier's: a prompt's receipt comes later, from the Done message.
    if (result.paying.method !== "prompt") {
      receiptWanted.current = true;
      tab.current = documentTab();
    }
    const body: Pay = towards.kind === "visit"
      ? { patientId: patient.id, towards: { encounterId: towards.encounterId }, bill: towards.unbilledCents > 0, paying: result.paying }
      : { patientId: patient.id, towards: { invoiceId: towards.invoiceId }, bill: false, paying: result.paying };
    answered(await pay.press(body));
  }

  function printAgain(documentId: string) {
    setPrintProblem(null);
    openDocument(documentId, documentTab()).catch(error => setPrintProblem(documentFailureText(error)));
  }

  function mainLabel(): string {
    if (state.kind === "sending")
      return waiting?.body.paying.method === "prompt" ? words.sendingPrompt : words.recording;
    if (state.kind === "no_answer")
      return waiting?.body.paying.method === "prompt" ? words.tryAgainPrompt : words.tryAgain;
    const cents = centsFromShillings(amount);
    const sum = cents ? formatKes(cents) : null;
    switch (shown.method) {
      case "paybill": return chosenPayment ? words.record.paybill(formatKes(chosenPayment.amountCents)) : words.recordChosen;
      case "prompt": return sum && phone.trim() ? words.sendPrompt(sum, phone.trim()) : words.sendPromptBare;
      case "cash": return words.record.cash(sum ?? words.theAmount);
      default: return words.record[shown.cardOrBank](sum ?? words.theAmount);
    }
  }

  const receipt = state.kind === "done" && state.result.kind === "paid"
    ? state.result
    : laterPayment.data
      ? { receiptNumber: laterPayment.data.receiptNumber, documentId: laterPayment.data.documentId, amountCents: laterPayment.data.amountCents }
      : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {receipt && <PaidMessage receipt={receipt} where={towards.kind} dueCents={dueCents} dueRead={dueRead} onPrint={() => printAgain(receipt.documentId)} printProblem={printProblem} />}
        {prompted && promptOpen && (
          <Alert variant="caution" role="status">
            <AlertTitle>{words.waitingTitle(name)}</AlertTitle>
            <AlertDescription>{words.waitingHelp(formatKes(prompted.amountCents), prompted.phone)}</AlertDescription>
            {prompt.isError && <AlertDescription>{words.waitingReadFailed(failureText(prompt.error))}</AlertDescription>}
          </Alert>
        )}
        {/* Paid on the phone, or placed from the paybill: the payment is recorded, and its receipt is read to print. */}
        {((prompted && promptStatus === "completed") || placed) && !laterPayment.data && (
          laterPayment.isError
            ? (
                <Alert variant="problem">
                  <AlertTitle>{prompted ? words.promptPaid(name) : words.placed(name)}</AlertTitle>
                  <AlertDescription>{words.receiptReadFailed(failureText(laterPayment.error))}</AlertDescription>
                  <Button variant="link" className="self-start" onClick={() => void laterPayment.refetch()}>{en.errors.tryAgain}</Button>
                </Alert>
              )
            : (
                <Alert variant="done">
                  <AlertTitle>{prompted ? words.promptPaid(name) : words.placed(name)}</AlertTitle>
                  <AlertDescription>{words.readingReceipt}</AlertDescription>
                </Alert>
              )
        )}
        {prompted && promptStatus === "failed" && (
          <Alert variant="problem">
            <AlertTitle>{words.promptFailed}</AlertTitle>
            <AlertDescription>{[prompt.data?.resultDesc, words.promptFailedHelp].filter(Boolean).join(" ")}</AlertDescription>
          </Alert>
        )}
        {/* Paid at another desk, or the visit closed, while it was open here. */}
        {dueCents === null && !receipt && !prompted && !waiting && dueRead.read && !dueRead.checking && (
          <Alert variant="caution">
            <AlertTitle>{nothingDue.title}</AlertTitle>
            <AlertDescription>{nothingDue.help}</AlertDescription>
          </Alert>
        )}
        {children}
        {dueCents !== null && !promptOpen && (
          <fieldset disabled={waiting !== null || held} className="flex min-w-0 flex-col gap-4">
            <legend className="pb-2.5 text-lg font-semibold">{words.how(name)}</legend>
            <Choices
              options={(["paybill", "prompt", "cash", "card_or_bank"] as const).map(method => ({ value: method, label: method === "card_or_bank" ? words.methods.cardOrBank : words.methods[method] }))}
              value={shown.method}
              onChange={method => change({ method })}
              wide
            />
            {shown.method === "paybill" && (
              <PaybillPayments
                payments={unmatched}
                chosenId={shown.transactionId}
                onChoose={transactionId => change({ transactionId })}
                problem={problems.transaction}
              />
            )}
            {shown.method !== "paybill" && (
              <div className="flex flex-wrap gap-4 *:w-[260px]">
                <TextField
                  label={words.amount}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={LIMITS.amount}
                  value={amount}
                  onChange={(event) => {
                    setAmountTyped(true);
                    change({ amount: event.target.value });
                  }}
                  problem={problems.amount}
                />
                {shown.method === "prompt" && (
                  <TextField
                    label={words.phone}
                    hint={words.phoneHint}
                    type="tel"
                    autoComplete="off"
                    maxLength={LIMITS.phone}
                    value={phone}
                    onChange={(event) => {
                      setPhoneTyped(true);
                      change({ phone: event.target.value });
                    }}
                    problem={problems.phone}
                  />
                )}
              </div>
            )}
            {shown.method === "card_or_bank" && (
              <div className="flex flex-col gap-4">
                <Choices
                  legend={words.cardOrBank}
                  options={[{ value: "card", label: words.card }, { value: "bank", label: words.bank }]}
                  value={shown.cardOrBank}
                  onChange={cardOrBank => change({ cardOrBank })}
                />
                <TextField
                  className="w-[360px] max-w-full"
                  label={words.reference[shown.cardOrBank]}
                  hint={words.referenceHint}
                  autoComplete="off"
                  maxLength={LIMITS.reference}
                  value={shown.reference}
                  onChange={event => change({ reference: event.target.value })}
                  problem={problems.reference}
                />
              </div>
            )}
          </fieldset>
        )}
        <details className="border-t border-secondary pt-1">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-link">{words.howItWorks}</summary>
          <div className="flex flex-col gap-2 pb-2 text-secondary-foreground">
            <p>{words.howVisit}</p>
            <p>{words.howReversed}</p>
            <p>{words.howReceipt}</p>
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
        {dueCents !== null || waiting
          ? (
              <>
                {needsShift && !waiting && <p className="font-semibold text-caution-foreground">{words.noShift}</p>}
                {held && !waiting && <p className="font-semibold text-caution-foreground">{words.heldByCredit}</p>}
                <Button ref={main} disabled={state.kind === "sending" || promptOpen || (needsShift && !waiting) || (held && !waiting)} onClick={() => void press()}>
                  {promptOpen ? words.waitingTitle(name) : mainLabel()}
                </Button>
                {shown.method !== "paybill" && !promptOpen && <p className="text-sm text-muted-foreground">{words.partHint(name)}</p>}
              </>
            )
          : (
              <Button ref={main} onClick={() => window.history.replaceState(null, "", window.location.pathname)}>{words.next}</Button>
            )}
      </div>
    </>
  );
}

/** The Done message of a payment: its receipt, and what is still due, as the API says once read again. */
function PaidMessage({ receipt, where, dueCents, dueRead, onPrint, printProblem }: {
  receipt: { receiptNumber: string; documentId: string; amountCents: number };
  where: Towards["kind"];
  dueCents: number | null;
  dueRead: { checking: boolean; failed: boolean };
  onPrint: () => void;
  printProblem: string | null;
}) {
  const { facility } = useWorking();
  const frontDesk = desksFor(facility.roles).find(desk => desk.id === "front-desk");
  // Read again since the payment: until then, what is due is from before it.
  const { checking, failed } = dueRead;
  const unknown = checking || failed;
  return (
    <Alert variant="done">
      <AlertTitle>
        {unknown || dueCents !== null ? words.paidPart(formatKes(receipt.amountCents), receipt.receiptNumber) : words.paidInFull(receipt.receiptNumber)}
      </AlertTitle>
      <AlertDescription>
        {checking ? words.checkingStill : failed ? words.stillUnknown : dueCents !== null ? words.stillToPay[where](formatKes(dueCents)) : words.paidInFullHelp[where]}
      </AlertDescription>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1">
        <Button variant="quiet" className="border-done-border text-done-foreground" onClick={onPrint}>{words.printAgain}</Button>
        {/* The front desk is usually also the cashier: back to the next patient there. */}
        {frontDesk && <Link href={frontDesk.path} className="flex min-h-11 items-center text-link underline underline-offset-2">{words.backTo(en.desks[frontDesk.id])}</Link>}
      </div>
      {printProblem && <AlertDescription className="font-semibold">{words.printFailed(printProblem)}</AlertDescription>}
    </Alert>
  );
}

/** A choice pressed like a button, one of a few. */
function Choices<Value extends string>({ legend, options, value, onChange, wide = false }: {
  legend?: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  /** The ways to pay: taller, as the screen's main choice. */
  wide?: boolean;
}) {
  const buttons = (
    <div className="flex flex-wrap gap-2">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg border px-[18px]",
            wide ? "min-h-[52px]" : "min-h-12",
            value === option.value ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  if (!legend)
    return buttons;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 font-semibold">{legend}</legend>
      {buttons}
    </fieldset>
  );
}

/** Finding the M-Pesa payment to the paybill that is the patient's, among those nothing matched yet. */
function PaybillPayments({ payments, chosenId, onChoose, problem }: {
  payments: ReturnType<typeof useUnmatchedPayments>;
  chosenId: string | null;
  onChoose: (transactionId: string) => void;
  problem?: string;
}) {
  const id = useId();
  const today = useBusinessDate();
  const [term, setTerm] = useState("");
  const shown = payments.data ? matchingPayments(payments.data, term) : [];
  return (
    <div className="flex flex-col gap-2.5">
      <TextField
        className="max-w-[520px]"
        label={words.find}
        hint={words.findHint}
        type="search"
        autoComplete="off"
        spellCheck={false}
        maxLength={LIMITS.find}
        value={term}
        onChange={event => setTerm(event.target.value)}
      />
      {payments.data
        ? shown.length === 0
          ? <p className="text-secondary-foreground">{payments.data.length === 0 ? words.noneWaiting : words.noneFound(term.trim())}</p>
          : (
              <ul aria-describedby={problem ? `${id}-problem` : undefined} className="flex max-w-[520px] flex-col gap-2">
                {shown.map((payment) => {
                  const pressed = payment.id === chosenId;
                  return (
                    <li key={payment.id}>
                      <button
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => onChoose(payment.id)}
                        className={cn(
                          "flex min-h-[60px] w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left",
                          pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                          problem && "border-problem-foreground",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className={pressed ? "font-bold" : "font-semibold"}>{payment.transactionId}</span>
                          <span className={cn("text-sm", pressed ? "text-foreground" : "text-muted-foreground")}>
                            {words.unmatchedLine(payerPhone(payment.msisdn), printedSince(new Date(payment.transactedAt), today))}
                          </span>
                        </span>
                        <span className={cn("whitespace-nowrap", pressed ? "font-bold" : "font-semibold")}>{formatKes(payment.amountCents)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
        : !payments.isError && <p role="status" className="text-muted-foreground">{words.findChecking}</p>}
      {problem && <p id={`${id}-problem`} data-problem className="text-sm font-semibold text-problem-foreground">{problem}</p>}
      {payments.isError && (
        <Alert variant="problem">
          <AlertDescription>{words.findReadFailed(failureText(payments.error))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={() => void payments.refetch()}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
    </div>
  );
}
