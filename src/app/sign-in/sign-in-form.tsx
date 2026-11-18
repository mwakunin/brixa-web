"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formCard, primaryAction, Problem } from "@/components/form-card";
import { TextField } from "@/components/text-field";
import { signIn, useSession } from "@/lib/auth-client";
import { forgotPasswordHref } from "@/lib/navigation";
import { type SignInFailure, signInFailureText } from "@/lib/sign-in";
import { en } from "@/strings/en";

import { CodeForm } from "./code-form";

/**
 * Email and password, and nothing else: accounts are by invitation. Then the
 * code from the person's authenticator app, on the same page (`CodeForm`);
 * someone who has not set one up yet is signed in by the password alone and
 * taken to set it up (SessionGate).
 *
 * The session ends when the browser closes (`rememberMe: false`): the
 * computers at a desk are shared. A failed attempt keeps the email, clears the
 * password and puts the cursor back in it. `next` is the page that sent them
 * here, already checked (`safeNext`); a detour through a forgotten password
 * keeps it.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [askingForCode, setAskingForCode] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  // Whether this form is still on screen: a slow sign-in that finishes after
  // they went to "Forgot your password?" must not pull them away from it.
  const here = useRef(true);

  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  // Signed in already, in another tab or before pressing Back: carry on.
  useEffect(() => {
    if (session)
      router.replace(next);
  }, [session, router, next]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { data, error } = await signIn.email({ email, password, rememberMe: false });
      if (!here.current)
        return;
      if (!error) {
        setPassword("");
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
          setPending(false);
          setAskingForCode(true);
          return;
        }
        router.replace(next);
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

  // Back from the code, with why if there is a reason: the email kept, the password to type again.
  function startAgain(reason: string | null) {
    setAskingForCode(false);
    setProblem(reason);
    setPending(false);
    requestAnimationFrame(() => passwordInput.current?.focus());
  }

  if (askingForCode)
    return <CodeForm next={next} onStartAgain={startAgain} />;

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.signIn.title}</h1>
      <TextField label={en.signIn.email} type="email" name="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); setProblem(null); }} />
      <TextField ref={passwordInput} label={en.signIn.password} type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.signIn.submitting : en.signIn.submit}
      </button>
      <Link href={forgotPasswordHref(next)} className="-mt-2 self-start py-3 text-[15px] text-blue-700 underline underline-offset-2">{en.signIn.forgot}</Link>
    </form>
  );
}
