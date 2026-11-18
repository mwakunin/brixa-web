import type { SignInFailure } from "@/lib/sign-in";

import { en } from "@/strings/en";

/**
 * What a failed password-reset step says to the person.
 *
 * Better Auth answers with its own codes and English that was not written for
 * staff, so each case these two steps can give is named here. The API's rate
 * limiter answers 429 with a message written for staff, which is shown as it
 * is. `null` means the request never reached the API, or its answer was lost.
 */
type Failure = SignInFailure | null;

/**
 * Asking for a reset link. Whether the address has an account is never said,
 * so only these can fail. A 400 is the API failing to read the address as
 * one: the browser accepts some it does not, such as `alex@hospital`.
 */
export function resetRequestFailureText(failure: Failure): string {
  if (failure === null)
    return en.errors.offline;
  if (failure.status === 400)
    return en.passwordReset.checkEmail;
  if (failure.status === 429)
    return failure.message || en.signIn.tooMany;
  return en.passwordReset.failed;
}

/**
 * Whether a reset may have been saved though its answer said otherwise: no
 * answer came, or the server failed (a 5xx can come after the change was
 * committed). A link refused after that may have been spent by this try.
 */
export function answerMayBeLost(failure: Failure): boolean {
  return failure === null || failure.status >= 500;
}

export interface ResetFailure {
  text: string;
  /** The link itself is the problem (expired, or used): offer to send a new one. */
  askAgain: boolean;
  /** An earlier try's answer was lost, so the password may have changed already: offer to sign in too. */
  mayHaveChanged: boolean;
}

/**
 * Choosing the new password. `answerLost` says an earlier try from this page
 * never got its answer: a link refused now may have been spent by that try,
 * so the password may already be the one typed. That is said as a
 * possibility, never as a success.
 */
export function resetFailure(failure: Failure, { answerLost = false }: { answerLost?: boolean } = {}): ResetFailure {
  const plain = (text: string) => ({ text, askAgain: false, mayHaveChanged: false });
  if (failure === null)
    return plain(en.errors.offline);
  if (failure.code === "INVALID_TOKEN") {
    return answerLost
      ? { text: en.passwordReset.mayHaveChanged, askAgain: true, mayHaveChanged: true }
      : { text: en.passwordReset.linkInvalid, askAgain: true, mayHaveChanged: false };
  }
  if (failure.code === "PASSWORD_TOO_SHORT")
    return plain(en.newPassword.rules);
  if (failure.code === "PASSWORD_TOO_LONG")
    return plain(en.newPassword.tooLong);
  if (failure.status === 429)
    return plain(failure.message || en.signIn.tooMany);
  return plain(en.passwordReset.failed);
}
