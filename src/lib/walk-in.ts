import type { paths } from "@/lib/api/schema";

import { en } from "@/strings/en";

/**
 * Tests from an outside doctor's request (`POST /encounters/{id}/walk-in-orders`):
 * the patient goes straight to the lab, with the request as written, or asks
 * for the tests themselves.
 */
export type WalkInBody = paths["/encounters/{id}/walk-in-orders"]["post"]["requestBody"]["content"]["application/json"];
type LabTest = paths["/lab-tests"]["get"]["responses"][200]["content"]["application/json"]["tests"][number];
type PricedItem = paths["/billable-items"]["get"]["responses"][200]["content"]["application/json"]["items"][number];

/** The form, as typed. */
export interface WalkInDraft {
  doctor: string;
  facility: string;
  licence: string;
  /** No request: the patient asks for the tests themselves. */
  selfRequested: boolean;
  testIds: string[];
  urgent: boolean;
  indication: string;
}

export const emptyWalkIn: WalkInDraft = { doctor: "", facility: "", licence: "", selfRequested: false, testIds: [], urgent: false, indication: "" };

/** The longest each field may be, as brixa-api's `routes/orders/orders.routes.ts` caps it. */
export const WALK_IN_LIMITS = { doctor: 120, facility: 120, licence: 40, indication: 500, tests: 30 } as const;

export type WalkInField = "doctor" | "facility" | "licence" | "tests" | "indication";
export type WalkInProblems = Partial<Record<WalkInField, string>>;

const words = en.walkIn.problems;
const filled = (text: string) => text.trim().length > 0;

/** The body to send for what was typed, or what must be put right first. */
export function walkInBody(draft: WalkInDraft): { ok: true; body: WalkInBody } | { ok: false; problems: WalkInProblems } {
  const problems: WalkInProblems = {};
  if (!draft.selfRequested && !filled(draft.doctor))
    problems.doctor = words.doctor;
  if (!draft.selfRequested && !filled(draft.facility))
    problems.facility = words.facility;
  if (draft.testIds.length === 0)
    problems.tests = words.tests;
  else if (draft.testIds.length > WALK_IN_LIMITS.tests)
    problems.tests = words.tooManyTests(WALK_IN_LIMITS.tests);
  if (Object.keys(problems).length > 0)
    return { ok: false, problems };
  return {
    ok: true,
    body: {
      ...(draft.selfRequested
        ? { selfRequested: true as const }
        : { requester: { name: draft.doctor.trim(), facility: draft.facility.trim(), ...(filled(draft.licence) && { licenceNumber: draft.licence.trim() }) } }),
      ...(draft.urgent && { urgency: "urgent" as const }),
      ...(filled(draft.indication) && { indication: draft.indication.trim() }),
      labTestIds: draft.testIds,
    },
  };
}

/** The field a refused value belongs to, from the path the API gave it, with what to say there in our words. */
export function walkInFieldProblem(path: string): { field: WalkInField; problem: string } | null {
  const [first, inner] = path.split(".");
  if (first === "requester")
    return inner === "facility" ? { field: "facility", problem: words.oneLine } : inner === "licenceNumber" ? { field: "licence", problem: words.oneLine } : { field: "doctor", problem: words.oneLine };
  if (first === "indication")
    return { field: "indication", problem: words.oneLine };
  if (first === "labTestIds")
    return { field: "tests", problem: words.tests };
  return null;
}

/** A lab test as the front desk offers it: its name, and today's cash price, or null while it has none. */
export interface OfferedTest {
  id: string;
  name: string;
  priceCents: number | null;
}

/** The lab's tests in use, by name, each with the price of the item it charges. */
export function offeredTests(tests: readonly LabTest[], items: readonly PricedItem[]): OfferedTest[] {
  const prices = new Map(items.map(item => [item.id, item.cashPriceCents]));
  return tests
    .filter(test => test.isActive)
    .map(test => ({ id: test.id, name: test.name, priceCents: prices.get(test.billableItemId) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The tests whose name holds every word typed, in any order and any case. */
export function testsMatching(tests: readonly OfferedTest[], typed: string): OfferedTest[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return tests.filter(test => words.every(word => test.name.toLowerCase().includes(word)));
}
