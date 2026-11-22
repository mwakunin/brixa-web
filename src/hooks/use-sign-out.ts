"use client";

import { useState, useSyncExternalStore } from "react";

import { signOut } from "@/lib/auth-client";
import { chooseFacility } from "@/lib/facility";
import { SIGN_IN_PATH } from "@/lib/navigation";

/** True while this tab signs out on purpose, with whoever watches it. */
let leaving = false;
const watchers = new Set<() => void>();

function setLeaving(now: boolean): void {
  leaving = now;
  watchers.forEach(changed => changed());
}

function watchLeaving(changed: () => void): () => void {
  watchers.add(changed);
  return () => watchers.delete(changed);
}

/**
 * Whether this tab is signing out on purpose. The session empties before
 * the sign-in page loads, and whatever notices that first must not send the
 * page there itself with a `next`: the next person at a shared desk would
 * be sent on to the last person's page.
 */
export function signingOut(): boolean {
  return leaving;
}

/** `signingOut()`, for a component to show again when it changes: a sign-out that failed hands the page back. */
export function useSigningOut(): boolean {
  return useSyncExternalStore(watchLeaving, signingOut, () => false);
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
    setLeaving(true);
    try {
      const { error } = await signOut();
      // 401: the session had already ended, which is what was asked.
      if (error && error.status !== 401)
        throw error;
    }
    catch {
      setLeaving(false);
      setState("failed");
      return;
    }
    chooseFacility(null);
    window.location.assign(SIGN_IN_PATH);
  }

  return { signOut: run, state };
}
