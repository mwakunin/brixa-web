import type { paths } from "@/lib/api/schema";
import { en } from "@/strings/en";

/**
 * The facility this browser is working in.
 *
 * A person may work at several facilities; the one chosen at the picker is
 * sent as `X-Facility-Id` on every tenant request (the hostname never chooses
 * a tenant). Only its id is kept, and an id is not patient data. Storage can
 * be missing or blocked, so every access is guarded and the app works without
 * it: the picker is simply shown again.
 */
const KEY = "brixa.facilityId";

/** One place this person works, as `GET /me/facilities` lists it. */
export type MyFacility = paths["/me/facilities"]["get"]["responses"][200]["content"]["application/json"]["facilities"][number];
export type MembershipRole = MyFacility["roles"][number];

export function chosenFacilityId(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  catch {
    return null;
  }
}

export function chooseFacility(id: string | null): void {
  try {
    if (id === null)
      globalThis.localStorage?.removeItem(KEY);
    else
      globalThis.localStorage?.setItem(KEY, id);
  }
  catch {
    // Nothing to do: the choice lasts for this page only.
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

/** A facility's roles as staff say them: "Records clerk, Cashier". */
export function roleNames(roles: readonly MembershipRole[]): string {
  return roles.map(role => en.roles[role]).join(", ");
}

/** Whether there is anywhere else to switch to. */
export function canSwitch(facilities: MyFacility[]): boolean {
  return facilities.filter(f => f.status === "active").length > 1;
}
