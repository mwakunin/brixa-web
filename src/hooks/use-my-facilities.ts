"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { unwrap } from "@/lib/api/refusal";

/** Where the signed-in person works and their roles there (`GET /me/facilities`). */
export function useMyFacilities() {
  return useQuery({
    queryKey: ["me", "facilities"],
    queryFn: async () => (await unwrap(api.GET("/me/facilities"))).facilities,
  });
}
