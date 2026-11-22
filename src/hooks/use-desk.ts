"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/*
 * What the front desk reads besides patients: where people wait, the day's
 * bookings, and the lab's tests with their prices.
 */

export const servicePointsKey = ["service-points"] as const;
export const appointmentsKey = (date: string) => ["appointments", date] as const;

/** Triage and the clinics, each with how many are waiting there now (`GET /service-points`). */
export function useServicePoints() {
  return useQuery({
    queryKey: servicePointsKey,
    queryFn: async () => (await unwrap(api.GET("/service-points"))).servicePoints,
  });
}

/**
 * A day's appointments, by time (`GET /appointments?date=`): the desk's own
 * list, like a queue, so it is read when the desk opens and again when the
 * window is looked at. The first page of 200 is a day's bookings and more.
 */
export function useAppointments(date: string) {
  return useQuery({
    queryKey: appointmentsKey(date),
    queryFn: async () => (await unwrap(api.GET("/appointments", { params: { query: { date } } }))).appointments,
  });
}

/** The lab's tests (`GET /lab-tests`), and the item catalogue with today's cash prices (`GET /billable-items`). */
export function useLabTests() {
  return useQuery({
    queryKey: ["lab-tests"],
    queryFn: async () => (await unwrap(api.GET("/lab-tests"))).tests,
    staleTime: 5 * 60_000,
  });
}

export function usePriceList() {
  return useQuery({
    queryKey: ["billable-items"],
    queryFn: async () => (await unwrap(api.GET("/billable-items"))).items,
    staleTime: 5 * 60_000,
  });
}
