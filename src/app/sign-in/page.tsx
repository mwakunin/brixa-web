import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { en } from "@/strings/en";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: en.signIn.title };

/**
 * Sign in (the journey's screen 1). There is no "forgot your password" link:
 * the API cannot reset one yet (docs/outpatient-journey.md, gap 7).
 */
export default function SignInPage() {
  return (
    <CenteredPage>
      <Brand />
      <SignInForm />
      <p className="max-w-[420px] text-center text-[15px] text-slate-600">{en.signIn.byInvitation}</p>
    </CenteredPage>
  );
}
