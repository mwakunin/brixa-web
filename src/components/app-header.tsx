"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand";
import { useWorking } from "@/components/facility-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { useSession } from "@/lib/auth-client";
import { canSwitch } from "@/lib/facility";
import { FACILITIES_PATH } from "@/lib/navigation";
import { en } from "@/strings/en";

/**
 * The bar across every desk: where you are working and who you are, a way to
 * another facility when there is one, and sign out. The desk's own name
 * joins it when the desks are built. It is white, so a desk's main button is
 * the one dark thing on the screen.
 */
export function AppHeader() {
  const { facility, facilities } = useWorking();
  const { data: session } = useSession();
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-6 py-2">
      <span className="flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-lg font-bold">{en.app.name}</span>
      </span>
      <span className="text-muted-foreground">{facility.name}</span>
      <span className="ml-auto text-muted-foreground">{session?.user.name}</span>
      {canSwitch(facilities) && (
        <Link href={FACILITIES_PATH} className="flex min-h-11 items-center text-link underline underline-offset-2">
          {en.header.switchFacility}
        </Link>
      )}
      <SignOutButton className="text-link" />
    </header>
  );
}
