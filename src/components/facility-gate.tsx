"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect } from "react";

import { PageFailed, PageLoading } from "@/components/page-states";
import { useMyFacilities } from "@/hooks/use-my-facilities";
import { failureText } from "@/lib/api/refusal";
import { chooseFacility, chosenFacilityId, landing, type MyFacility } from "@/lib/facility";
import { facilitiesHref } from "@/lib/navigation";
import { en } from "@/strings/en";

interface Working {
  /** The facility being worked in: every tenant request names it. */
  facility: MyFacility;
  /** Everywhere this person works, for the header's "Switch facility". */
  facilities: MyFacility[];
}

const WorkingContext = createContext<Working | null>(null);

/** The facility the page below is working in. */
export function useWorking(): Working {
  const working = use(WorkingContext);
  if (!working)
    throw new Error("useWorking is for pages inside FacilityGate");
  return working;
}

/**
 * Shows its pages once there is a facility to work in.
 *
 * Someone with one open facility goes straight in; someone with several goes
 * back to the one this browser chose, or to the picker, and comes back here
 * once they have chosen. The choice is re-checked against `/me/facilities`
 * on every load, so a membership that has ended or a facility since
 * suspended is never worked in.
 */
export function FacilityGate({ children }: { children: React.ReactNode }) {
  const { data: facilities, error, refetch } = useMyFacilities();
  const router = useRouter();
  const where = facilities ? landing(facilities, chosenFacilityId()) : null;
  const mustChoose = where !== null && where.kind !== "in";

  useEffect(() => {
    if (mustChoose)
      router.replace(facilitiesHref(window.location.pathname + window.location.search));
  }, [mustChoose, router]);

  if (facilities && where?.kind === "in") {
    // Kept before anything below renders, so the first request it makes already names the facility.
    if (chosenFacilityId() !== where.facility.id)
      chooseFacility(where.facility.id);
    return <WorkingContext value={{ facility: where.facility, facilities }}>{children}</WorkingContext>;
  }
  if (error && !facilities)
    return <PageFailed message={failureText(error)} onRetry={() => void refetch()} />;
  return <PageLoading message={en.facilities.loading} />;
}
