"use client";

import { useSignOut } from "@/hooks/use-sign-out";
import { en } from "@/strings/en";

/** Sign out, as a button that reads like a link; says so when it could not reach the API. */
export function SignOutButton({ className }: { className?: string }) {
  const { signOut, state } = useSignOut();
  return (
    <>
      <button type="button" onClick={() => void signOut()} disabled={state === "pending"} className={`min-h-11 underline underline-offset-2 ${className ?? ""}`}>
        {state === "pending" ? en.session.signingOut : en.session.signOut}
      </button>
      {state === "failed" && <p role="alert">{en.session.signOutFailed}</p>}
    </>
  );
}
