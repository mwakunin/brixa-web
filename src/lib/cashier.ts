import type { paths } from "@/lib/api/schema";
import type { MembershipRole } from "@/lib/facility";

import { businessDate, dayBefore, printedDateThisYear } from "@/lib/dates";
import { centsFromShillings, formatKes } from "@/lib/money";
import { en } from "@/strings/en";

/** A visit on the cashier's list, with what is due on it (`GET /cashier/due`). */
export type DueVisit = paths["/cashier/due"]["get"]["responses"][200]["content"]["application/json"]["visits"][number];

/** The cashier's own open shift and its takings (`GET /cashier-shifts/current`). */
export type Shift = NonNullable<paths["/cashier-shifts/current"]["get"]["responses"][200]["content"]["application/json"]["shift"]>;

/** A visit's charges, and the total of those still standing (`GET /encounters/{id}/charges`). */
export type Bill = paths["/encounters/{id}/charges"]["get"]["responses"][200]["content"]["application/json"];
export type Charge = Bill["charges"][number];

/** A quantity as staff say it: the API gives three places ("24.000"), a bill shows "24", or "1.5". */
export function printedQuantity(quantity: string): string {
  return quantity.includes(".") ? quantity.replace(/\.?0+$/, "") : quantity;
}

/** A line of the bill: what was done, with its price each when there was more than one. */
export function billLine(charge: Charge): string {
  return printedQuantity(charge.quantity) === "1" ? charge.name : en.cashier.lineAt(charge.name, formatKes(charge.unitPriceCents));
}

/** The lines on the bill: a cancelled charge is not asked for, and its total does not count it. */
export function standingCharges(charges: readonly Charge[]): Charge[] {
  return charges.filter(charge => charge.cancelledAt === null);
}

/** Which visit a bill is for, said under the patient's name: "today's outpatient visit". */
export function visitWords(visit: Pick<DueVisit, "kind" | "startedAt">, today: string): string {
  const kind = en.visits.kinds[visit.kind];
  const day = businessDate(new Date(visit.startedAt));
  if (day === today)
    return en.cashier.visitToday(kind);
  if (day === dayBefore(today))
    return en.cashier.visitYesterday(kind);
  return en.cashier.visitOn(kind, printedDateThisYear(day, today));
}

/** The ways a patient pays, as the cashier chooses them: card and bank share a button. */
export type PayingBy = "paybill" | "prompt" | "cash" | "card_or_bank";

/** What the cashier has chosen and typed to take a payment. */
export interface PaymentDraft {
  method: PayingBy;
  cardOrBank: "card" | "bank";
  /** In shillings, as typed. */
  amount: string;
  phone: string;
  reference: string;
  /** The M-Pesa payment chosen from those waiting to be matched. */
  transactionId: string | null;
}

/** M-Pesa paid to the paybill first, then the prompt, cash, and card or bank (the walkthrough, 2026-11-20). */
export const emptyPayment: PaymentDraft = { method: "paybill", cardOrBank: "card", amount: "", phone: "", reference: "", transactionId: null };

/** What a press sends, fixed at the press: a payment by one method, for one amount. */
export type Paying
  = | { method: "paybill"; transactionId: string; amountCents: number }
    | { method: "prompt"; phone: string; amountCents: number }
    | { method: "cash"; amountCents: number }
    | { method: "card" | "bank"; amountCents: number; reference: string };

export type PaymentField = "amount" | "phone" | "reference" | "transaction";

/** As the API takes a card's or a transfer's reference. */
const REFERENCE = /^[\w /-]{3,40}$/;
/** As long as the API takes a phone to prompt; its format is the API's to check. */
const PHONE_LENGTH = { min: 9, max: 16 };

/**
 * The payment the draft asks for, or what must be put right first, at its
 * field. A payment to the paybill is for the amount M-Pesa received, given
 * as `transactionCents`, whatever was typed.
 */
export function payingFor(draft: PaymentDraft, transactionCents: number | null): { ok: true; paying: Paying } | { ok: false; problems: Partial<Record<PaymentField, string>> } {
  const words = en.cashier.pay.problems;
  if (draft.method === "paybill") {
    return draft.transactionId && transactionCents !== null
      ? { ok: true, paying: { method: "paybill", transactionId: draft.transactionId, amountCents: transactionCents } }
      : { ok: false, problems: { transaction: words.transaction } };
  }
  const problems: Partial<Record<PaymentField, string>> = {};
  const amountCents = centsFromShillings(draft.amount);
  if (!amountCents)
    problems.amount = words.amount;
  const phone = draft.phone.trim();
  if (draft.method === "prompt" && (phone.length < PHONE_LENGTH.min || phone.length > PHONE_LENGTH.max))
    problems.phone = words.phone;
  const reference = draft.reference.trim();
  if (draft.method === "card_or_bank" && !REFERENCE.test(reference))
    problems.reference = words.reference;
  if (!amountCents || Object.keys(problems).length > 0)
    return { ok: false, problems };
  if (draft.method === "prompt")
    return { ok: true, paying: { method: "prompt", phone, amountCents } };
  if (draft.method === "cash")
    return { ok: true, paying: { method: "cash", amountCents } };
  return { ok: true, paying: { method: draft.cardOrBank, amountCents, reference } };
}

/**
 * The M-Pesa payments waiting to be matched that fit what the cashier
 * typed: part of the M-Pesa code, or of the phone that paid, as dialled at
 * home (0712…) or with the country code.
 */
export function matchingPayments<T extends { transactionId: string; msisdn: string }>(waiting: readonly T[], typed: string): T[] {
  const text = typed.trim();
  if (text === "")
    return [...waiting];
  if (/[a-z]/i.test(text))
    return waiting.filter(payment => payment.transactionId.toUpperCase().includes(text.toUpperCase()));
  const digits = text.replace(/\D/g, "").replace(/^0/, "");
  return waiting.filter(payment => payment.msisdn.replace(/\D/g, "").includes(digits));
}

/** The field a value the API did not accept belongs to, from the path it gave, with what to say there in our words. */
export function paymentFieldProblem(path: string): { field: PaymentField; problem: string } | null {
  const words = en.cashier.pay.problems.notAccepted;
  if (path === "phone")
    return { field: "phone", problem: words.phone };
  if (path === "reference")
    return { field: "reference", problem: words.reference };
  if (path === "amountCents")
    return { field: "amount", problem: words.amount };
  return null;
}

/**
 * Who may read a patient's account, as the API allows it (brixa-api's
 * receipt readers). The screens ask for it only for them; the API checks
 * every call all the same.
 */
const ACCOUNT_READERS: readonly MembershipRole[] = ["cashier", "billing_clerk", "finance_manager", "facility_admin", "auditor"];

export function mayReadAccount(roles: readonly MembershipRole[]): boolean {
  return roles.some(role => ACCOUNT_READERS.includes(role));
}

/** The choice of a bill for a waiver that stands for the visit's charges not billed yet, which are billed first. */
export const NOT_BILLED = "not-billed";

/** What the cashier has chosen and typed to ask for a waiver. */
export interface WaiverDraft {
  /** A bill's id, or `NOT_BILLED`. */
  billId: string | null;
  /** In shillings, as typed. */
  amount: string;
  reason: string;
}

export const emptyWaiver: WaiverDraft = { billId: null, amount: "", reason: "" };

export type WaiverField = "bill" | "amount" | "reason";

/** As long as the API takes a reason. */
const REASON_LENGTH = { min: 3, max: 200 };

/** The waiver the draft asks for, or what must be put right first, at its field. */
export function waiverFor(draft: WaiverDraft): { ok: true; waiver: { invoiceId: string | null; amountCents: number; reason: string } } | { ok: false; problems: Partial<Record<WaiverField, string>> } {
  const words = en.cashier.waiver.problems;
  const problems: Partial<Record<WaiverField, string>> = {};
  if (!draft.billId)
    problems.bill = words.bill;
  const amountCents = centsFromShillings(draft.amount);
  if (!amountCents)
    problems.amount = words.amount;
  const reason = draft.reason.trim();
  if (reason.length < REASON_LENGTH.min || reason.length > REASON_LENGTH.max)
    problems.reason = words.reason;
  if (!draft.billId || !amountCents || Object.keys(problems).length > 0)
    return { ok: false, problems };
  return { ok: true, waiver: { invoiceId: draft.billId === NOT_BILLED ? null : draft.billId, amountCents, reason } };
}
