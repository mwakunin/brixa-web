"use client";

import { useQuery } from "@tanstack/react-query";

import type { DueVisit } from "@/lib/cashier";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/*
 * What the cashier reads: who has money due, a visit's bill, and the
 * cashier's own shift.
 */

/** The API's page of the money due list. */
const DUE_PAGE = 200;

export const dueKey = ["cashier", "due"] as const;
export const shiftKey = ["cashier-shifts", "current"] as const;
export const billKey = (encounterId: string) => ["encounters", encounterId, "charges"] as const;

/**
 * Every open visit with money due, oldest first (`GET /cashier/due`): the
 * desk's own list, like a queue, so it is read when the desk opens and again
 * when the window is looked at. The API gives 200 a page; a busier day is
 * read page by page until a page comes back short.
 */
export function useMoneyDue() {
  return useQuery({
    queryKey: dueKey,
    queryFn: async () => {
      const all: DueVisit[] = [];
      for (;;) {
        const page = (await unwrap(api.GET("/cashier/due", { params: { query: { offset: all.length } } }))).visits;
        all.push(...page);
        if (page.length < DUE_PAGE)
          return all;
      }
    },
  });
}

/** The cashier's own open shift, or null when none is open (`GET /cashier-shifts/current`). */
export function useCurrentShift() {
  return useQuery({
    queryKey: shiftKey,
    queryFn: async () => (await unwrap(api.GET("/cashier-shifts/current"))).shift,
  });
}

/**
 * A visit's charges (`GET /encounters/{id}/charges`). What was done for a
 * patient is part of their record, so each read is audited: it is read when
 * the cashier opens the visit, once `enabled`, and not again because the
 * window was looked at.
 */
export function useBill(encounterId: string, enabled: boolean) {
  return useQuery({
    queryKey: billKey(encounterId),
    queryFn: async () => unwrap(api.GET("/encounters/{id}/charges", { params: { path: { id: encounterId } } })),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
