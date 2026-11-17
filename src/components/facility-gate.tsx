"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect } from "react";

import { PageFailed, PageLoading } from "@/components/page-states";
import { useMyFacilities } from "@/hooks/use-my-facilities";
import { failureText } from "@/lib/api/refusal";
import { type MyFacility, settle } from "@/lib/facility";
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
 * back to the one this tab or browser chose, or to the picker, and comes back
 * here once they have chosen. The choice is checked against `/me/facilities`
 * when the page loads and whenever that list is fetched again, so a
 * membership that has ended or a facility since suspended is not offered.
 * Between fetches the API is the control: it refuses every request for a
 * facility that is suspended or no longer theirs, and the screen shows why.
 */
export function FacilityGate({ children }: { children: React.ReactNode }) {
  const { data: facilities, error, refetch } = useMyFacilities();
  const router = useRouter();
  // Pinned to this tab before anything below renders, so the first request it makes already names the facility it shows.
  const where = facilities ? settle(facilities) : null;
  const mustChoose = where !== null && where.kind !== "in";

  useEffect(() => {
    if (mustChoose)
      router.replace(facilitiesHref(window.location.pathname + window.location.search));
  }, [mustChoose, router]);

  if (facilities && where?.kind === "in")
    return <WorkingContext value={{ facility: where.facility, facilities }}>{children}</WorkingContext>;
  if (error && !facilities)
    return <PageFailed message={failureText(error)} onRetry={() => void refetch()} />;
  return <PageLoading message={en.facilities.loading} />;
}
