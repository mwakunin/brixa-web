import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { en } from "@/strings/en";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: en.passwordReset.requestPageTitle };

/** Asking for a link to choose a new password, from the sign-in page's "Forgot your password?". */
export default function ForgotPasswordPage() {
  return (
    <CenteredPage>
      <Brand />
      <ForgotPasswordForm />
    </CenteredPage>
  );
}
