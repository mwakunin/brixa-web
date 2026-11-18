"use client";

import { useEffect } from "react";

import { PageFailed, PageLoading } from "@/components/page-states";
import { useSession } from "@/lib/auth-client";
import { setUpSignInHref, signInHref } from "@/lib/navigation";
import { en } from "@/strings/en";

/**
 * Shows its pages only to someone signed in.
 *
 * The session is a cookie on the API's host, which this app's server never
 * sees, so the check runs here, in the browser, by asking the API. Someone
 * signed out is sent to sign in and brought back afterwards. The sign-in page
 * is loaded afresh, not navigated to, so nothing read for the last person
 * stays in memory for the next. A check that could not reach the API says so
 * and offers to try again: it is not taken as signed out, which would throw
 * away the page they were on.
 *
 * Someone signed in by their password alone has not set up two-step sign-in
 * yet, and the API answers them nothing else: they are sent to set it up,
 * and brought back here afterwards.
 *
 * Hiding a page is a convenience: the API still checks every call.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, error, refetch } = useSession();
  const signedOut = !isPending && !error && !data;
  const notSetUp = data !== null && data !== undefined && data.user.twoFactorEnabled !== true;

  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (signedOut)
      window.location.replace(signInHref(here));
    else if (notSetUp)
      window.location.replace(setUpSignInHref(here));
  }, [signedOut, notSetUp]);

  if (error && !data)
    return <PageFailed message={en.errors.offline} onRetry={() => void refetch()} />;
  if (!data || notSetUp)
    return <PageLoading message={en.session.checking} />;
  return children;
}
