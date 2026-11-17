"use client";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { SignOutButton } from "@/components/sign-out-button";
import { useSession } from "@/lib/auth-client";
import { en } from "@/strings/en";

/** Where a signed-in person lands until their desk's screen is built (ROADMAP §1, step F3). */
export default function Home() {
  const { data } = useSession();
  return (
    <CenteredPage>
      <Brand />
      {data && <p className="text-lg font-semibold">{en.session.signedInAs(data.user.name)}</p>}
      <p className="max-w-md text-center text-slate-600">{en.home.notBuiltYet}</p>
      <SignOutButton className="text-blue-700" />
    </CenteredPage>
  );
}
