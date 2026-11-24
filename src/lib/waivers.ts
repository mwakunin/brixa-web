import type { paths } from "@/lib/api/schema";

import { businessDate } from "@/lib/dates";
import { en } from "@/strings/en";

/** An adjustment as listed (`GET /adjustments`): a waiver, or another kind the screens do not ask for yet. */
export type Adjustment = paths["/adjustments"]["get"]["responses"][200]["content"]["application/json"]["adjustments"][number];

const isWaiver = (adjustment: Adjustment) => adjustment.kind === "waiver";

/** The waivers waiting for the in-charge's decision, the longest waiting first (the API lists the newest first). */
export function waitingWaivers(listed: readonly Adjustment[]): Adjustment[] {
  return listed
    .filter(adjustment => isWaiver(adjustment) && adjustment.status === "pending")
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/** The waivers approved or rejected on `today`, Nairobi's, the latest decided first. */
export function decidedToday(listed: readonly Adjustment[], today: string): Adjustment[] {
  return listed
    .filter(adjustment => isWaiver(adjustment)
      && (adjustment.status === "approved" || adjustment.status === "rejected")
      && adjustment.decidedAt !== null
      && businessDate(new Date(adjustment.decidedAt)) === today)
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
}

/** Who a waiver is for, as the in-charge's screen names it: the patient, or the payer's bill it is on. */
export function waiverFor(adjustment: Adjustment): string {
  return adjustment.patient?.name ?? en.waivers.payerBill;
}
