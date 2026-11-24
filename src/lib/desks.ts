import type { MembershipRole } from "@/lib/facility";

/**
 * The desks: one screen per job, each the landing place of the roles that do
 * that job. A person lands on their first desk and switches to their others
 * from the header. Only the desks built so far are listed.
 *
 * Which desk someone sees is a convenience: the API checks every call.
 */
export const DESKS = [
  { id: "front-desk", path: "/front-desk", roles: ["records_clerk"] },
  { id: "triage", path: "/triage", roles: ["nurse"] },
  { id: "cashier", path: "/cashier", roles: ["cashier"] },
  // Those who approve waivers: never the cashier who asked (rule 24).
  { id: "waivers", path: "/waivers", roles: ["finance_manager", "facility_admin"] },
] as const satisfies readonly { id: string; path: `/${string}`; roles: readonly MembershipRole[] }[];

export type Desk = (typeof DESKS)[number];

/** The desks a person's roles here give them, in the order they are listed. */
export function desksFor(roles: readonly MembershipRole[]): Desk[] {
  return DESKS.filter(desk => desk.roles.some(role => roles.includes(role)));
}

/** The desk a page belongs to, if it is one. */
export function deskAt(pathname: string): Desk | null {
  return DESKS.find(desk => pathname === desk.path || pathname.startsWith(`${desk.path}/`)) ?? null;
}
