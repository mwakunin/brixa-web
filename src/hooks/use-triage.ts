"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/** How often the triage queue is read while the desk is open: new arrivals show without anyone pressing. */
const QUEUE_CHECK_MS = 30_000;

export const queueKey = (servicePointId: string) => ["service-points", servicePointId, "queue"] as const;
export const allergiesKey = (patientId: string) => ["patients", patientId, "allergies"] as const;

/**
 * Who is being seen at a service point, then who is waiting, by arrival
 * (`GET /service-points/{id}/queue`). Audited, as it names patients and
 * where they are. It is the desk's own list, so it is read every half
 * minute while the desk is shown, and again when the window is looked at.
 */
export function useQueue(servicePointId: string | null) {
  return useQuery({
    queryKey: queueKey(servicePointId ?? ""),
    queryFn: async () => unwrap(api.GET("/service-points/{id}/queue", { params: { path: { id: servicePointId! } } })),
    enabled: servicePointId !== null,
    refetchInterval: QUEUE_CHECK_MS,
  });
}

/**
 * A patient's standing allergies, or a standing "no known allergies"; none
 * means nobody has asked yet (`GET /patients/{id}/allergies`). Audited, so
 * read once the patient is with the nurse, and not again because the
 * window was looked at.
 */
export function useAllergies(patientId: string) {
  return useQuery({
    queryKey: allergiesKey(patientId),
    queryFn: async () => (await unwrap(api.GET("/patients/{id}/allergies", { params: { path: { id: patientId } } }))).allergies,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
