"use client";

import Link from "next/link";
import { useState } from "react";

import { formCard, OutcomeTitle, primaryAction, Problem } from "@/components/form-card";
import { NewPasswordFields, useNewPassword } from "@/components/new-password-fields";
import type { paths } from "@/lib/api/schema";

import { api } from "@/lib/api/client";
import { failureText } from "@/lib/api/refusal";
import { acceptFailureText } from "@/lib/invitation";
import { SIGN_IN_PATH } from "@/lib/navigation";
import { en } from "@/strings/en";

type Accepted = paths["/invitations/accept"]["post"]["responses"][200]["content"]["application/json"];

/**
 * A new member of staff chooses their password; someone who already has an
 * account leaves it empty, keeps theirs, and gains the membership. The API
 * tells which happened, and the page says so, then sends them to sign in.
 */
export function AcceptInvitationForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const newPassword = useNewPassword(() => setProblem(null));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPassword.matches()) {
      setProblem(en.newPassword.mismatch);
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      // No password: someone who has an account already keeps theirs.
      const { password } = newPassword;
      const { data, error, response } = await api.POST("/invitations/accept", { body: { token, ...(password ? { password } : {}) } });
      if (data) {
        setAccepted(data);
        return;
      }
      setProblem(acceptFailureText(response.status, error));
    }
    catch (error) {
      setProblem(failureText(error));
    }
    setPending(false);
  }

  if (accepted) {
    return (
      <div className={formCard}>
        <OutcomeTitle>{accepted.accountCreated ? en.acceptInvitation.createdTitle : en.acceptInvitation.joinedTitle}</OutcomeTitle>
        <p>{accepted.accountCreated ? en.acceptInvitation.created(accepted.facilityName) : en.acceptInvitation.joined(accepted.facilityName)}</p>
        <Link href={SIGN_IN_PATH} className={primaryAction}>{en.acceptInvitation.signIn}</Link>
      </div>
    );
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.acceptInvitation.title}</h1>
      <p>{en.acceptInvitation.intro}</p>
      <NewPasswordFields label={en.acceptInvitation.password} {...newPassword.fields} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.acceptInvitation.submitting : en.acceptInvitation.submit}
      </button>
    </form>
  );
}
