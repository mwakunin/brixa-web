"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/*
 * Waivers (`GET /adjustments`): the in-charge's queue, what they decided, and
 * those asked for on one visit's bills. Each read names patients and is
 * audited, so each is read when its screen opens.
 */

export const adjustmentsKey = ["adjustments"] as const;
const waitingKey = [...adjustmentsKey, "pending"] as const;
const recentKey = [...adjustmentsKey, "recent"] as const;
export const visitWaiversKey = (encounterId: string) => [...adjustmentsKey, "visit", encounterId] as const;

/** Every adjustment waiting for a decision (`?status=pending`): the in-charge's queue, read like one. */
export function useWaitingAdjustments() {
  return useQuery({
    queryKey: waitingKey,
    queryFn: async () => (await unwrap(api.GET("/adjustments", { params: { query: { status: "pending" } } }))).adjustments,
  });
}

/** The latest adjustments, whatever their state: what was decided today is among them. */
export function useRecentAdjustments() {
  return useQuery({
    queryKey: recentKey,
    queryFn: async () => (await unwrap(api.GET("/adjustments"))).adjustments,
  });
}

/**
 * The waivers asked for on one visit's bills and still waiting
 * (`?encounterId=&status=pending`): read when the cashier opens the visit's
 * bill, and not again because the window was looked at.
 */
export function useVisitWaivers(encounterId: string, enabled: boolean) {
  return useQuery({
    queryKey: visitWaiversKey(encounterId),
    queryFn: async () => (await unwrap(api.GET("/adjustments", { params: { query: { encounterId, status: "pending" } } }))).adjustments,
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
