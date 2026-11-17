import createClient, { type Middleware } from "openapi-fetch";

import { API_URL } from "@/lib/env";
import { chosenFacilityId } from "@/lib/facility";

import type { paths } from "./schema";

/**
 * The one way this app talks to the API.
 *
 * Paths, parameters, bodies and responses are typed from `schema.d.ts`, which
 * is generated from the API's own OpenAPI document (`pnpm codegen`) and never
 * edited by hand: a contract change shows up as a type error here, not as a
 * surprise at a service point.
 *
 *   const { data, error, response } = await api.GET("/patients/{id}", { params: { path: { id } } });
 *
 * `error` is the API's body for a refusal; `refusalOf` (./refusal) turns it
 * into what the screen should say.
 */
export const FACILITY_HEADER = "X-Facility-Id";

/** Names the facility this tab is working in on every request that has not named one itself. */
export const facilityHeader: Middleware = {
  onRequest({ request }) {
    const facilityId = chosenFacilityId();
    if (facilityId && !request.headers.has(FACILITY_HEADER))
      request.headers.set(FACILITY_HEADER, facilityId);
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: API_URL,
  // The session is a cookie the API set; it is sent on every call.
  credentials: "include",
});

api.use(facilityHeader);
