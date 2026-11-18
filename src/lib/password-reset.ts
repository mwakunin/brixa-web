import type { SignInFailure } from "@/lib/sign-in";

import { en } from "@/strings/en";

/**
 * What a failed password-reset step says to the person.
 *
 * Better Auth answers with its own codes and English that was not written for
 * staff, so each case these two steps can give is named here. The API's rate
 * limiter answers 429 with a message written for staff, which is shown as it
 * is. `null` means the request never reached the API.
 */
type Failure = SignInFailure | null;

/** Asking for a reset link. Whether the address has an account is never said, so only these can fail. */
export function resetRequestFailureText(failure: Failure): string {
  if (failure === null)
    return en.errors.offline;
  if (failure.status === 429)
    return failure.message || en.signIn.tooMany;
  return en.passwordReset.failed;
}

/**
 * Choosing the new password. `askAgain` is true when the link itself is the
 * problem (expired, or used already), so the page offers to send a new one.
 */
export function resetFailure(failure: Failure): { text: string; askAgain: boolean } {
  if (failure === null)
    return { text: en.errors.offline, askAgain: false };
  if (failure.code === "INVALID_TOKEN")
    return { text: en.passwordReset.linkInvalid, askAgain: true };
  if (failure.code === "PASSWORD_TOO_SHORT" || failure.code === "PASSWORD_TOO_LONG")
    return { text: en.newPassword.rules, askAgain: false };
  if (failure.status === 429)
    return { text: failure.message || en.signIn.tooMany, askAgain: false };
  return { text: en.passwordReset.failed, askAgain: false };
}
