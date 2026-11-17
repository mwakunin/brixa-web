"use client";

import { useEffect } from "react";

import { PageFailed, PageLoading } from "@/components/page-states";
import { useSession } from "@/lib/auth-client";
import { signInHref } from "@/lib/navigation";
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
 * Hiding a page is a convenience: the API still checks every call.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, error, refetch } = useSession();
  const signedOut = !isPending && !error && !data;

  useEffect(() => {
    if (signedOut)
      window.location.replace(signInHref(window.location.pathname + window.location.search));
  }, [signedOut]);

  if (error && !data)
    return <PageFailed message={en.errors.offline} onRetry={() => void refetch()} />;
  if (!data)
    return <PageLoading message={en.session.checking} />;
  return children;
}
