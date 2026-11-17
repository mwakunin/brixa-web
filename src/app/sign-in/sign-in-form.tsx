"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TextField } from "@/components/text-field";
import { signIn, useSession } from "@/lib/auth-client";
import { safeNext } from "@/lib/navigation";
import { type SignInFailure, signInFailureText } from "@/lib/sign-in";
import { en } from "@/strings/en";

/** The page that sent them here, read when it is needed: the form renders without waiting for the URL. */
function nextPath(): string {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/**
 * Email and password, and nothing else: accounts are by invitation.
 *
 * The session ends when the browser closes (`rememberMe: false`): the
 * computers at a desk are shared. A failed attempt keeps the email, clears the
 * password and puts the cursor back in it.
 */
export function SignInForm() {
  const router = useRouter();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  // Signed in already, in another tab or before pressing Back: carry on.
  useEffect(() => {
    if (session)
      router.replace(nextPath());
  }, [session, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = await signIn.email({ email, password, rememberMe: false });
      if (!error) {
        router.replace(nextPath());
        return;
      }
      failure = error;
    }
    catch {
      failure = null;
    }
    setProblem(signInFailureText(failure));
    setPassword("");
    setPending(false);
    passwordInput.current?.focus();
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-slate-300 bg-white p-8">
      <h1 className="text-[22px] font-semibold">{en.signIn.title}</h1>
      <TextField label={en.signIn.email} type="email" name="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
      <TextField ref={passwordInput} label={en.signIn.password} type="password" name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      {problem && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{problem}</p>}
      <button type="submit" disabled={pending} className="h-12 rounded-lg bg-slate-900 font-semibold text-white disabled:bg-slate-700">
        {pending ? en.signIn.submitting : en.signIn.submit}
      </button>
    </form>
  );
}
