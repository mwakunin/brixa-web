import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { FORGOT_PASSWORD_PATH } from "@/lib/navigation";
import { en } from "@/strings/en";

import { ResetPasswordForm } from "./reset-password-form";

// The token is in this page's URL: no request from it says where it came from.
export const metadata: Metadata = { title: en.passwordReset.pageTitle, referrer: "no-referrer" };

/** Where the API's reset email leads (`/reset-password?token=…`). */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <CenteredPage>
      <Brand />
      {typeof token === "string" && token.length > 0
        ? <ResetPasswordForm token={token} />
        : (
            <div role="alert" className="flex max-w-[420px] flex-col items-center gap-2 text-center">
              <p>{en.passwordReset.noToken}</p>
              <Link href={FORGOT_PASSWORD_PATH} className="py-3 text-link underline underline-offset-2">{en.passwordReset.askAgain}</Link>
            </div>
          )}
    </CenteredPage>
  );
}
