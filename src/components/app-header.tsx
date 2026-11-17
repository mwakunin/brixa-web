"use client";

import Link from "next/link";

import { useWorking } from "@/components/facility-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { useSession } from "@/lib/auth-client";
import { canSwitch } from "@/lib/facility";
import { FACILITIES_PATH } from "@/lib/navigation";
import { en } from "@/strings/en";

/**
 * The bar across every desk: where you are working and who you are, a way to
 * another facility when there is one, and sign out. The desk's own name
 * joins it when the desks are built.
 */
export function AppHeader() {
  const { facility, facilities } = useWorking();
  const { data: session } = useSession();
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-slate-900 px-6 py-2.5 text-white">
      <span className="text-xl font-bold">{en.app.name}</span>
      <span className="text-slate-300">{facility.name}</span>
      <span className="ml-auto text-slate-200">{session?.user.name}</span>
      {canSwitch(facilities) && (
        <Link href={FACILITIES_PATH} className="flex min-h-11 items-center underline underline-offset-2 focus-visible:outline-white">
          {en.header.switchFacility}
        </Link>
      )}
      <SignOutButton className="focus-visible:outline-white" />
    </header>
  );
}
