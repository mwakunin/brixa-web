"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useWorking } from "@/components/facility-gate";
import { PageLoading } from "@/components/page-states";
import { desksFor } from "@/lib/desks";
import { roleNames } from "@/lib/facility";
import { en } from "@/strings/en";

/**
 * Where a signed-in person lands: their first desk, by their roles here.
 * Someone whose desk is not built yet sees where they are and their roles
 * (ROADMAP §1, step F3).
 */
export default function Home() {
  const { facility } = useWorking();
  const router = useRouter();
  const desk = desksFor(facility.roles)[0];

  useEffect(() => {
    if (desk)
      router.replace(desk.path);
  }, [desk, router]);

  if (desk)
    return <PageLoading message={en.home.openingDesk} />;
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-6 py-5">
      <h1 className="text-name font-bold">{facility.name}</h1>
      <p className="text-lg">{en.home.yourRoles(roleNames(facility.roles))}</p>
      <p className="max-w-2xl text-muted-foreground">{en.home.notBuiltYet}</p>
    </main>
  );
}
