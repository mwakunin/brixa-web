import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { firstParam, safeNext } from "@/lib/navigation";
import { en } from "@/strings/en";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: en.passwordReset.requestPageTitle };

/**
 * Asking for a link to choose a new password, from the sign-in page's "Forgot
 * your password?". `?next=` rides along, so going back to sign in still lands
 * on the page they were heading to.
 */
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { next } = await searchParams;
  return (
    <CenteredPage>
      <Brand />
      <ForgotPasswordForm next={safeNext(firstParam(next))} />
    </CenteredPage>
  );
}
