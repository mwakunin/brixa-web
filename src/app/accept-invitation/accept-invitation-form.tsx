"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { TextField } from "@/components/text-field";
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const confirmInput = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setProblem(en.acceptInvitation.mismatch);
      setConfirm("");
      confirmInput.current?.focus();
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      // No password: someone who has an account already keeps theirs.
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
      <div className="flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-slate-300 bg-white p-8">
        {/* Focused when it appears, so a screen reader reads the outcome rather than nothing. */}
        <h1 ref={heading => heading?.focus()} tabIndex={-1} className="text-[22px] font-semibold">
          {accepted.accountCreated ? en.acceptInvitation.createdTitle : en.acceptInvitation.joinedTitle}
        </h1>
        <p>{accepted.accountCreated ? en.acceptInvitation.created(accepted.facilityName) : en.acceptInvitation.joined(accepted.facilityName)}</p>
        <Link href={SIGN_IN_PATH} className="flex h-12 items-center justify-center rounded-lg bg-slate-900 font-semibold text-white">
          {en.acceptInvitation.signIn}
        </Link>
      </div>
    );
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-slate-300 bg-white p-8">
      <h1 className="text-[22px] font-semibold">{en.acceptInvitation.title}</h1>
      <p>{en.acceptInvitation.intro}</p>
      <TextField label={en.acceptInvitation.password} hint={en.acceptInvitation.passwordHint} type="password" name="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} />
      <TextField ref={confirmInput} label={en.acceptInvitation.confirm} type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setProblem(null); }} />
      {problem && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{problem}</p>}
      <button type="submit" disabled={pending} className="h-12 rounded-lg bg-slate-900 font-semibold text-white disabled:bg-slate-700">
        {pending ? en.acceptInvitation.submitting : en.acceptInvitation.submit}
      </button>
    </form>
  );
}
