import type { paths } from "@/lib/api/schema";

import { businessDate, dayBefore, printedDateThisYear } from "@/lib/dates";
import { formatKes } from "@/lib/money";
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
