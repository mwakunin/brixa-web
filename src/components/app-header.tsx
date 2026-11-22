"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand";
import { useWorking } from "@/components/facility-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { useSession } from "@/lib/auth-client";
import { deskAt, desksFor } from "@/lib/desks";
import { canSwitch } from "@/lib/facility";
import { FACILITIES_PATH } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

/**
 * The bar across every desk: where you are working, the desk you are at,
 * and who you are; a way to another facility when there is one, and sign
 * out. Someone with several desks switches between them here, without
 * signing in again. It is white, so a desk's main button is the one dark
 * thing on the screen.
 */
export function AppHeader() {
  const { facility, facilities } = useWorking();
  const { data: session } = useSession();
  const pathname = usePathname();
  const desks = desksFor(facility.roles);
  const here = deskAt(pathname);
  return (
    <header className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-6 py-2">
      <span className="flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-lg font-bold">{en.app.name}</span>
      </span>
      <span className="text-muted-foreground">{facility.name}</span>
      {desks.length > 1
        ? (
            <nav aria-label={en.header.yourDesks} className="flex gap-1 rounded-full bg-secondary p-1">
              {desks.map(desk => (
                <Link
                  key={desk.id}
                  href={desk.path}
                  aria-current={desk.id === here?.id ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-full border px-[18px]",
                    desk.id === here?.id ? "border-input bg-card font-bold text-foreground" : "border-transparent font-semibold text-secondary-foreground",
                  )}
                >
                  {en.desks[desk.id]}
                </Link>
              ))}
            </nav>
          )
        : here && (
          <>
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <span className="font-bold">{en.desks[here.id]}</span>
          </>
        )}
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
