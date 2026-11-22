"use client";

import { useState } from "react";

import { signOut } from "@/lib/auth-client";
import { chooseFacility } from "@/lib/facility";
import { SIGN_IN_PATH } from "@/lib/navigation";

/** True while this tab signs out on purpose. */
let leaving = false;

/**
 * Whether this tab is signing out on purpose. The session empties before
 * the sign-in page loads, and whatever notices that first must not send the
 * page there itself with a `next`: the next person at a shared desk would
 * be sent on to the last person's page.
 */
export function signingOut(): boolean {
  return leaving;
}

/**
 * Signs out and leaves nothing behind.
 *
 * The facility choice is forgotten, and the sign-in page is loaded afresh
 * rather than navigated to, so everything the API returned, which lives only
 * in this page's memory, goes with it. A desk computer is shared.
 */
export function useSignOut() {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  async function run() {
    setState("pending");
    leaving = true;
    try {
      const { error } = await signOut();
      // 401: the session had already ended, which is what was asked.
      if (error && error.status !== 401)
        throw error;
    }
    catch {
      leaving = false;
      setState("failed");
      return;
    }
    chooseFacility(null);
    window.location.assign(SIGN_IN_PATH);
  }

  return { signOut: run, state };
}
