"use client";

import { useState } from "react";

import { signOut } from "@/lib/auth-client";
import { chooseFacility } from "@/lib/facility";
import { SIGN_IN_PATH } from "@/lib/navigation";

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
    try {
      const { error } = await signOut();
      // 401: the session had already ended, which is what was asked.
      if (error && error.status !== 401)
        throw error;
    }
    catch {
      setState("failed");
      return;
    }
    chooseFacility(null);
    window.location.assign(SIGN_IN_PATH);
  }

  return { signOut: run, state };
}
