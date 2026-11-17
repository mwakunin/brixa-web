import type { paths } from "@/lib/api/schema";
import { en } from "@/strings/en";

/**
 * The facility this tab is working in.
 *
 * A person may work at several facilities; the one this tab shows is sent as
 * `X-Facility-Id` on every tenant request (the hostname never chooses a
 * tenant). It is held in this tab's memory, so choosing another facility in a
 * second tab never changes where this one's requests go.
 *
 * The browser's storage keeps the last facility chosen at the picker, for
 * the next tab or the next sign-in to start from. Only its id is kept, and an
 * id is not patient data. Storage can be missing or blocked, so every access
 * is guarded and a choice lasts in memory when it cannot be stored.
 */
const KEY = "brixa.facilityId";

/** This tab's facility; null until it has one. */
let working: string | null = null;

/** One place this person works, as `GET /me/facilities` lists it. */
export type MyFacility = paths["/me/facilities"]["get"]["responses"][200]["content"]["application/json"]["facilities"][number];
export type MembershipRole = MyFacility["roles"][number];

/** This tab's facility, else the one last chosen in this browser. */
export function chosenFacilityId(): string | null {
  if (working !== null)
    return working;
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  catch {
    return null;
  }
}

/** Works in the facility this tab shows, leaving what other tabs start from as it is. */
export function workIn(id: string): void {
  working = id;
}

/** A choice made at the picker, kept for the next tab too; null forgets it everywhere (signing out). */
export function chooseFacility(id: string | null): void {
  working = id;
  try {
    if (id === null)
      globalThis.localStorage?.removeItem(KEY);
    else
      globalThis.localStorage?.setItem(KEY, id);
  }
  catch {
    // Not stored: the choice lasts in this tab's memory.
  }
}

/**
 * Where someone works now, given where they are a member and what this
 * browser chose before.
 *
 * - `in`: the facility chosen before, while it is still open to them; else
 *   their one open facility, with no picker to pass through.
 * - `pick`: several are open, or only suspended ones, which the picker shows
 *   locked so they can see why.
 * - `none`: they are a member nowhere yet.
 */
export type Landing
  = | { kind: "in"; facility: MyFacility }
    | { kind: "pick" }
    | { kind: "none" };

export function landing(facilities: MyFacility[], chosenId: string | null): Landing {
  const open = facilities.filter(f => f.status === "active");
  const chosen = open.find(f => f.id === chosenId);
  if (chosen)
    return { kind: "in", facility: chosen };
  if (open.length === 1)
    return { kind: "in", facility: open[0] };
  if (facilities.length === 0)
    return { kind: "none" };
  return { kind: "pick" };
}

/** The picker's order: the open facilities first, then the suspended, each in the API's order (by name). */
export function pickerOrder(facilities: MyFacility[]): MyFacility[] {
  const rank = (facility: MyFacility) => (facility.status === "active" ? 0 : 1);
  return [...facilities].sort((a, b) => rank(a) - rank(b));
}

/** A facility's roles as staff say them: "Records clerk, Cashier". */
export function roleNames(roles: readonly MembershipRole[]): string {
  return roles.map(role => en.roles[role]).join(", ");
}

/**
 * Where this tab works now (see `landing`), pinned to the tab when it is a
 * facility. Pinned even when it came from storage: from then on another
 * tab's choice does not move this one.
 */
export function settle(facilities: MyFacility[]): Landing {
  const where = landing(facilities, chosenFacilityId());
  if (where.kind === "in")
    workIn(where.facility.id);
  return where;
}

/** Whether there is anywhere else to switch to. */
export function canSwitch(facilities: MyFacility[]): boolean {
  return facilities.filter(f => f.status === "active").length > 1;
}
