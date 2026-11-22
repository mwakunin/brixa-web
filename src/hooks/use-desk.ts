"use client";

import { useQuery } from "@tanstack/react-query";

import type { paths } from "@/lib/api/schema";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/*
 * What the front desk reads besides patients: where people wait, the day's
 * bookings, and the lab's tests with their prices.
 */

type Appointment = paths["/appointments"]["get"]["responses"][200]["content"]["application/json"]["appointments"][number];

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
 * window is looked at. The API gives 200 a page; a busier day is read page
 * by page until all are in.
 */
export function useAppointments(date: string) {
  return useQuery({
    queryKey: appointmentsKey(date),
    queryFn: async () => {
      const all: Appointment[] = [];
      for (;;) {
        const page = await unwrap(api.GET("/appointments", { params: { query: { date, offset: all.length } } }));
        all.push(...page.appointments);
        if (page.appointments.length === 0 || all.length >= page.total)
          return all;
      }
    },
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
