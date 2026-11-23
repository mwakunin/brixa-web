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
export const unmatchedKey = ["mpesa", "unmatched"] as const;
export const accountKey = (patientId: string) => ["patients", patientId, "account"] as const;
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

/**
 * The M-Pesa payments to the paybill nothing matched to a patient, newest
 * first (`GET /mpesa/transactions?status=unmatched`): the API's first page,
 * of 100, holds a day's at a counter. Audited, as it shows payers' names and
 * phones, so it is read once the cashier starts looking for a payment.
 */
export function useUnmatchedPayments(enabled: boolean) {
  return useQuery({
    queryKey: unmatchedKey,
    queryFn: async () => (await unwrap(api.GET("/mpesa/transactions", { params: { query: { status: "unmatched" } } }))).transactions,
    enabled,
  });
}

/** How often a prompt to a phone is checked while the patient has it. */
const PROMPT_CHECK_MS = 3_000;

/**
 * A prompt sent to a patient's phone, checked every few seconds until it is
 * paid or has failed (`GET /mpesa/stk/{id}`).
 */
export function usePrompt(id: string | null) {
  return useQuery({
    queryKey: ["mpesa", "stk", id],
    queryFn: async () => unwrap(api.GET("/mpesa/stk/{id}", { params: { path: { id: id! } } })),
    enabled: id !== null,
    refetchInterval: query => (query.state.data?.status === "completed" || query.state.data?.status === "failed" ? false : PROMPT_CHECK_MS),
    refetchOnWindowFocus: false,
  });
}

/** A payment and its receipt (`GET /payments/{id}`), once a prompt has become one. */
export function usePayment(id: string | null) {
  return useQuery({
    queryKey: ["payments", id],
    queryFn: async () => unwrap(api.GET("/payments/{id}", { params: { path: { id: id! } } })),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * A patient's account (`GET /patients/{id}/account`): credit not yet applied,
 * and every bill out with what it still owes, oldest first. Audited, so read
 * when the patient's record or what they owe is opened, not again because
 * the window was looked at. Only those who handle money may read it.
 */
export function useAccount(patientId: string, enabled = true) {
  return useQuery({
    queryKey: accountKey(patientId),
    queryFn: async () => unwrap(api.GET("/patients/{id}/account", { params: { path: { id: patientId } } })),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
