"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { CenteredPage } from "@/components/centered-page";
import { PageFailed, PageLoading } from "@/components/page-states";
import { SignOutButton } from "@/components/sign-out-button";
import { useMyFacilities } from "@/hooks/use-my-facilities";
import { failureText } from "@/lib/api/refusal";
import { useSession } from "@/lib/auth-client";
import { canSwitch, chooseFacility, pickerOrder, roleNames } from "@/lib/facility";
import { safeNext } from "@/lib/navigation";
import { en } from "@/strings/en";

/**
 * Every facility this person works at, with their roles there. An open one
 * is chosen with one press; a suspended one is shown locked, with why, after
 * the open ones. The choice is this tab's, and the next tab starts from it.
 */
export function FacilityPicker() {
  const { data: facilities, error, refetch } = useMyFacilities();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  function choose(id: string) {
    chooseFacility(id);
    // What was read at another facility is not this one's: only who they are stays.
    queryClient.removeQueries({ predicate: query => query.queryKey[0] !== "me" });
    router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
  }

  if (error && !facilities)
    return <PageFailed message={failureText(error)} onRetry={() => void refetch()} />;
  if (!facilities)
    return <PageLoading message={en.facilities.loading} />;

  if (facilities.length === 0) {
    return (
      <CenteredPage>
        <div className="flex w-full max-w-[560px] flex-col gap-2">
          <h1 className="text-name font-semibold">{en.facilities.noneTitle}</h1>
          <p>{en.facilities.noneHelp}</p>
        </div>
        <SignOutButton className="text-link" />
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
      <div className="flex w-full max-w-[560px] flex-col gap-1.5">
        {session && <p className="text-sm text-muted-foreground">{en.session.signedInAs(session.user.name)}</p>}
        <h1 className="text-name font-semibold">{en.facilities.title}</h1>
      </div>
      <ul className="flex w-full max-w-[560px] flex-col gap-3">
        {pickerOrder(facilities).map(facility => (
          <li key={facility.id}>
            {facility.status === "active"
              ? (
                  <button type="button" onClick={() => choose(facility.id)} className="flex min-h-[84px] w-full items-center justify-between gap-4 rounded-xl border border-border-strong bg-card px-5 py-[18px] text-left hover:border-foreground">
                    <span className="flex flex-col gap-1">
                      <span className="text-lg font-semibold">{facility.name}</span>
                      <span className="text-sm text-muted-foreground">{roleNames(facility.roles)}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-6 shrink-0" />
                  </button>
                )
              : (
                  <div className="flex min-h-[84px] flex-col justify-center gap-1 rounded-xl border border-border bg-secondary px-5 py-[18px] text-secondary-foreground">
                    <span className="text-lg font-semibold">{facility.name}</span>
                    <span className="text-sm">{en.facilities.closed}</span>
                  </div>
                )}
          </li>
        ))}
      </ul>
      {canSwitch(facilities) && <p className="w-full max-w-[560px] text-sm text-muted-foreground">{en.facilities.switchLater}</p>}
      <SignOutButton className="text-link" />
    </CenteredPage>
  );
}
