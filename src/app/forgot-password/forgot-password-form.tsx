"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, PendingStatus, primaryAction, Problem } from "@/components/form-card";
import { TextField } from "@/components/text-field";
import { deadline, requestPasswordReset } from "@/lib/auth-client";
import { signInHref } from "@/lib/navigation";
import { resetRequestFailureText } from "@/lib/password-reset";
import type { SignInFailure } from "@/lib/sign-in";
import { en } from "@/strings/en";

/**
 * Asks the API to email a reset link. The answer is the same whether or not
 * the address has an account, and the API holds it for at least 1.5 s either
 * way (longer only if its own work runs longer), so the page says the same
 * thing either way. The address
 * cannot be changed while it is being sent, so what the page shows is what
 * was asked for.
 */
export function ForgotPasswordForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const backToSignIn = signInHref(next);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = await requestPasswordReset({ email, fetchOptions: deadline() });
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
        <Link href={backToSignIn} className={primaryAction}>{en.passwordReset.backToSignIn}</Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-title font-semibold">{en.passwordReset.requestTitle}</h1>
      <p>{en.passwordReset.requestIntro}</p>
      <TextField label={en.passwordReset.email} type="email" name="email" autoComplete="username" required readOnly={pending} value={email} onChange={(event) => { setEmail(event.target.value); setProblem(null); }} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <PendingStatus message={pending ? en.passwordReset.requesting : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.passwordReset.requesting : en.passwordReset.request}
      </button>
      <Link href={backToSignIn} className="-mt-2 self-start py-3 text-link underline underline-offset-2">{en.passwordReset.backToSignIn}</Link>
    </form>
  );
}
