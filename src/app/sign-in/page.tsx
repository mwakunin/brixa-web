import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { firstParam, safeNext } from "@/lib/navigation";
import { en } from "@/strings/en";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: en.signIn.title };

/**
 * Sign in (the journey's screen 1), with the way to a forgotten password under
 * the button. `?next=` is read here, on the server, so the form arrives
 * knowing where to send them, and links that detour keep it.
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return (
    <CenteredPage>
      <Brand />
      <SignInForm next={safeNext(firstParam(next))} />
      <p className="max-w-[420px] text-center text-[15px] text-slate-600">{en.signIn.byInvitation}</p>
    </CenteredPage>
  );
}
