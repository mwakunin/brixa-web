"use client";

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
 * A request that gets no answer is given up after 30 s, so a form never
 * waits for ever on a stalled connection: it says the connection failed and
 * lets the person try again. Slow connections are normal here, so the limit
 * is generous.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: "include", timeout: 30_000 },
});

export const { requestPasswordReset, resetPassword, signIn, signOut, useSession } = authClient;
