"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, PendingStatus, primaryAction, Problem } from "@/components/form-card";
import { NewPasswordFields, useNewPassword } from "@/components/new-password-fields";
import { resetPassword } from "@/lib/auth-client";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/navigation";
import { type ResetFailure, resetFailure } from "@/lib/password-reset";
import type { SignInFailure } from "@/lib/sign-in";
import { en } from "@/strings/en";

/**
 * The new password, typed twice. The API spends the link, signs the person
 * out everywhere and emails them a notice; nobody is signed in here, so the
 * page sends them to sign in with the new password.
 *
 * A link that has expired or was used comes with a way to ask for another,
 * which typing again does not take away. If an earlier try lost its answer,
 * the link may have been spent by that try, so signing in is offered as
 * well, as a possibility, never as a success.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ResetFailure | null>(null);
  const [answerLost, setAnswerLost] = useState(false);
  const [done, setDone] = useState(false);
  // A problem with the link outlasts typing; one with the password does not.
  const newPassword = useNewPassword(() => setProblem(current => (current?.askAgain ? current : null)));

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
    setProblem(resetFailure(failure, { answerLost }));
    if (failure === null)
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

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.passwordReset.title}</h1>
      <NewPasswordFields label={en.passwordReset.password} required readOnly={pending} {...newPassword.fields} />
      {problem && (
        <Problem>
          <p>{problem.text}</p>
          {(problem.mayHaveChanged || problem.askAgain) && (
            <div className="flex flex-wrap gap-x-6">
              {problem.mayHaveChanged && <Link href={SIGN_IN_PATH} className="py-2 font-semibold underline underline-offset-2">{en.passwordReset.signIn}</Link>}
              {problem.askAgain && <Link href={FORGOT_PASSWORD_PATH} className="py-2 font-semibold underline underline-offset-2">{en.passwordReset.askAgain}</Link>}
            </div>
          )}
        </Problem>
      )}
      <PendingStatus message={pending ? en.passwordReset.submitting : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.passwordReset.submitting : en.passwordReset.submit}
      </button>
    </form>
  );
}
