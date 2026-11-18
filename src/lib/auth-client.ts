"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { API_URL } from "@/lib/env";

/**
 * Better Auth, talking to the API where it lives.
 *
 * Accounts are invite-only: there is no sign-up here, only sign-in and
 * accepting an invitation. The session is a cookie the API sets, so every call
 * carries credentials. The API trusts this app's origin and no other (its
 * `APP_URL`); a sign-in from anywhere else is refused.
 *
 * Two-step sign-in: after the password, the API asks for a code
 * (`twoFactorRedirect`), which the sign-in page asks for in turn. The plugin
 * is given no redirect of its own, so the page stays in charge of where to go.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: "include" },
  plugins: [twoFactorClient()],
});

export const { requestPasswordReset, resetPassword, signIn, signOut, twoFactor, useSession } = authClient;

/** Long enough for a slow connection, which is normal here; short enough that nobody waits for ever. */
const DEADLINE_MS = 30_000;

/**
 * Gives up a request that has not finished within `ms`, its body included:
 * a form then says the connection failed and lets the person try again.
 *
 * Better Auth's own `timeout` stops counting once the headers arrive, so a
 * body that stalls would still hang the form; an abort signal ends the whole
 * request. Used on the password-reset calls. Sign-out is left without one: a
 * slow sign-out that did succeed must not be reported as still signed in.
 */
export function deadline(ms: number = DEADLINE_MS): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) };
}
