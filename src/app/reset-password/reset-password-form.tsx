"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, primaryAction, Problem } from "@/components/form-card";
import { NewPasswordFields, useNewPassword } from "@/components/new-password-fields";
import { resetPassword } from "@/lib/auth-client";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/navigation";
import { resetFailure } from "@/lib/password-reset";
import type { SignInFailure } from "@/lib/sign-in";
import { en } from "@/strings/en";

/**
 * The new password, typed twice. The API spends the link, signs the person
 * out everywhere and emails them a notice; nobody is signed in here, so the
 * page sends them to sign in with the new password. A link that has expired
 * or was used comes with a way to ask for another.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<{ text: string; askAgain: boolean } | null>(null);
  const [done, setDone] = useState(false);
  const newPassword = useNewPassword(() => setProblem(null));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword.matches()) {
      setProblem({ text: en.newPassword.mismatch, askAgain: false });
      return;
    }
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = await resetPassword({ newPassword: newPassword.password, token });
      if (!error) {
        setDone(true);
        return;
      }
      failure = error;
    }
    catch {
      failure = null;
    }
    setProblem(resetFailure(failure));
    setPending(false);
  }

  if (done) {
    return (
      <div className={formCard}>
        <OutcomeTitle>{en.passwordReset.doneTitle}</OutcomeTitle>
        <p>{en.passwordReset.done}</p>
        <Link href={SIGN_IN_PATH} className={primaryAction}>{en.passwordReset.signIn}</Link>
      </div>
    );
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.passwordReset.title}</h1>
      <NewPasswordFields label={en.passwordReset.password} required {...newPassword.fields} />
      {problem && (
        <Problem>
          <p>{problem.text}</p>
          {problem.askAgain && <Link href={FORGOT_PASSWORD_PATH} className="self-start py-2 font-semibold underline underline-offset-2">{en.passwordReset.askAgain}</Link>}
        </Problem>
      )}
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.passwordReset.submitting : en.passwordReset.submit}
      </button>
    </form>
  );
}
