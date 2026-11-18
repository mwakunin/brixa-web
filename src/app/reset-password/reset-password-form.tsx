"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, PendingStatus, primaryAction, Problem } from "@/components/form-card";
import { NewPasswordFields, useNewPassword } from "@/components/new-password-fields";
import { deadline, resetPassword } from "@/lib/auth-client";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/navigation";
import { answerMayBeLost, type ResetFailure, resetFailure } from "@/lib/password-reset";
import type { SignInFailure } from "@/lib/sign-in";
import { en } from "@/strings/en";

const secondaryLink = "self-start py-3 text-[15px] text-blue-700 underline underline-offset-2";

/**
 * The new password, typed twice. The API spends the link, signs the person
 * out everywhere and emails them a notice; nobody is signed in here, so the
 * page sends them to sign in with the new password.
 *
 * Once the API refuses the link (expired, or used), the form has nothing left
 * to do, so it gives way to the ways on: ask for a new link, and, if an
 * earlier try here may have been saved though its answer was lost, sign in
 * with the password from that try. That is said as a possibility, never as a
 * success.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ResetFailure | null>(null);
  const [answerLost, setAnswerLost] = useState(false);
  const [done, setDone] = useState(false);
  const newPassword = useNewPassword(() => setProblem(null));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword.matches()) {
      setProblem({ text: en.newPassword.mismatch, askAgain: false, mayHaveChanged: false });
      return;
    }
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = await resetPassword({ newPassword: newPassword.password, token, fetchOptions: deadline() });
      if (!error) {
        setDone(true);
        return;
      }
      failure = error;
    }
    catch {
      failure = null;
    }
    setProblem(resetFailure(failure, { answerLost }));
    if (answerMayBeLost(failure))
      setAnswerLost(true);
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

  if (problem?.askAgain) {
    return (
      <div className={formCard}>
        <OutcomeTitle>{en.passwordReset.linkInvalidTitle}</OutcomeTitle>
        <p>{problem.text}</p>
        {problem.mayHaveChanged
          ? (
              <>
                <Link href={SIGN_IN_PATH} className={primaryAction}>{en.passwordReset.signIn}</Link>
                <Link href={FORGOT_PASSWORD_PATH} className={secondaryLink}>{en.passwordReset.askAgain}</Link>
              </>
            )
          : <Link href={FORGOT_PASSWORD_PATH} className={primaryAction}>{en.passwordReset.askAgain}</Link>}
      </div>
    );
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.passwordReset.title}</h1>
      <NewPasswordFields label={en.passwordReset.password} required readOnly={pending} {...newPassword.fields} />
      {problem && <Problem><p>{problem.text}</p></Problem>}
      <PendingStatus message={pending ? en.passwordReset.submitting : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.passwordReset.submitting : en.passwordReset.submit}
      </button>
    </form>
  );
}
