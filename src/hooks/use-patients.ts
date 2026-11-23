"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/** The fewest characters the API searches on, and the most (brixa-api `routes/patients/patients.routes.ts`). */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

/*
 * Every read here is audited by the API: a search, the opening of a record,
 * the list of a patient's visits. Each is fetched when the person asks for
 * it, never ahead of time, and is not fetched again just because the window
 * was looked at (CLAUDE.md §4.7).
 */

export const patientKey = (id: string) => ["patients", id] as const;
export const visitsKey = (patientId: string) => ["patients", patientId, "visits"] as const;

/** Patients matching what was typed (`GET /patients?q=`); the last matches stay shown while the next are found. */
export function usePatientSearch(q: string) {
  return useQuery({
    queryKey: ["patients", "search", q],
    queryFn: async () => (await unwrap(api.GET("/patients", { params: { query: { q } } }))).patients,
    enabled: q.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

/**
 * A patient's record (`GET /patients/{id}`). Each opening of the record is
 * a read, and so recorded, however recently it was last read: what was read
 * before shows while it runs. Not read until `enabled`.
 */
export function usePatient(id: string, enabled = true) {
  return useQuery({
    queryKey: patientKey(id),
    queryFn: () => unwrap(api.GET("/patients/{id}", { params: { path: { id } } })),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

/** A patient's visits, newest first (`GET /encounters?patientId=`), read at each opening as the record is. The first page is all the front desk needs. */
export function usePatientVisits(patientId: string) {
  return useQuery({
    queryKey: visitsKey(patientId),
    queryFn: async () => (await unwrap(api.GET("/encounters", { params: { query: { patientId } } }))).encounters,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
