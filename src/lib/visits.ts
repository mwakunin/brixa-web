import type { paths } from "@/lib/api/schema";
import type { Fact } from "@/lib/patients";

import { businessDate, printedDay, printedSince } from "@/lib/dates";
import { en } from "@/strings/en";

/** One of a patient's visits, as `GET /encounters?patientId=` lists them, newest first. */
export type Visit = paths["/encounters"]["get"]["responses"][200]["content"]["application/json"]["encounters"][number];

/** Whether the patient has an outpatient visit open now, which the API would refuse to open twice. */
export function hasOpenOutpatientVisit(visits: readonly Visit[]): boolean {
  return visits.some(visit => visit.status === "open" && visit.kind === "opd");
}

/**
 * What the front desk says about a patient's visits: where they are now
 * while a visit is open, else the day they were last here. A cancelled visit
 * was opened by mistake, so it does not count as having been here.
 */
export function visitFact(visits: readonly Visit[], today: string): Fact {
  const words = en.visits;
  const open = visits.find(visit => visit.status === "open");
  if (open) {
    const kind = words.kindsNow[open.kind];
    const { queue } = open;
    const since = (at: string) => printedSince(new Date(at), today);
    const value = !queue
      ? words.open(kind, since(open.startedAt))
      : queue.status === "serving" && queue.servingAt
        ? words.serving(kind, queue.servicePointName, since(queue.servingAt))
        : words.waiting(kind, queue.servicePointName, since(queue.joinedAt));
    return { label: words.hereNow, value };
  }
  const last = visits.find(visit => visit.status !== "cancelled");
  return {
    label: words.lastHere,
    value: last ? words.before(printedDay(businessDate(new Date(last.startedAt)), today), words.kinds[last.kind]) : words.none,
  };
}
