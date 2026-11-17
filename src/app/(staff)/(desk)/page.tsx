"use client";

import { useWorking } from "@/components/facility-gate";
import { roleNames } from "@/lib/facility";
import { en } from "@/strings/en";

/** Where a signed-in person lands until their desk's screen is built (ROADMAP §1, step F3). */
export default function Home() {
  const { facility } = useWorking();
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-6 py-5">
      <h1 className="text-[28px] font-bold">{facility.name}</h1>
      <p className="text-lg">{en.home.yourRoles(roleNames(facility.roles))}</p>
      <p className="max-w-2xl text-slate-600">{en.home.notBuiltYet}</p>
    </main>
  );
}
