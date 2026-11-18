"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, primaryAction, Problem } from "@/components/form-card";
import { TextField } from "@/components/text-field";
import { requestPasswordReset } from "@/lib/auth-client";
import { SIGN_IN_PATH } from "@/lib/navigation";
import { resetRequestFailureText } from "@/lib/password-reset";
import type { SignInFailure } from "@/lib/sign-in";
import { en } from "@/strings/en";

/**
 * Asks the API to email a reset link. The answer is the same whether or not
 * the address has an account, and so is the time it takes (the API holds it
 * for a fixed 1.5 s), so the page says the same thing either way.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = await requestPasswordReset({ email });
      if (!error) {
        setSent(true);
        return;
      }
      failure = error;
    }
    catch {
      failure = null;
    }
    setProblem(resetRequestFailureText(failure));
    setPending(false);
  }

  if (sent) {
    return (
      <div className={formCard}>
        <OutcomeTitle>{en.passwordReset.sentTitle}</OutcomeTitle>
        <p>{en.passwordReset.sent}</p>
        <Link href={SIGN_IN_PATH} className={primaryAction}>{en.passwordReset.backToSignIn}</Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.passwordReset.requestTitle}</h1>
      <p>{en.passwordReset.requestIntro}</p>
      <TextField label={en.passwordReset.email} type="email" name="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); setProblem(null); }} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.passwordReset.requesting : en.passwordReset.request}
      </button>
      <Link href={SIGN_IN_PATH} className="-mt-2 self-start py-3 text-[15px] text-blue-700 underline underline-offset-2">{en.passwordReset.backToSignIn}</Link>
    </form>
  );
}
