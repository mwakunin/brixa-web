import type { SignInFailure } from "@/lib/sign-in";

import { en } from "@/strings/en";

/**
 * Two-step sign-in (brixa-api SPEC.md §2): after the password, a code from an
 * authenticator app, or one of the backup codes given when it was set up.
 *
 * Better Auth answers a code with its own codes and English that was not
 * written for staff, so each case is named here, as for the password
 * (`sign-in.ts`). `null` means the request never reached the API.
 */

/** What a refused code says, and whether the sign-in must go back to the password. */
export function codeFailure(failure: SignInFailure | null): { text: string; startAgain: boolean } {
  if (failure === null)
    return { text: en.errors.offline, startAgain: false };
  switch (failure.code) {
    case "INVALID_CODE":
      return { text: en.twoStep.wrongCode, startAgain: false };
    case "INVALID_BACKUP_CODE":
      return { text: en.twoStep.wrongBackupCode, startAgain: false };
    // Locked for longer than a sign-in waits for its code: it has to start again anyway.
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return { text: en.twoStep.locked, startAgain: true };
    case "INVALID_TWO_FACTOR_COOKIE":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return { text: en.twoStep.expired, startAgain: true };
  }
  if (failure.status === 429)
    return { text: failure.message || en.signIn.tooMany, startAgain: false };
  return { text: en.signIn.failed, startAgain: false };
}

/** What a refusal while setting up the authenticator says. */
export function setUpFailureText(failure: SignInFailure | null): string {
  if (failure === null)
    return en.errors.offline;
  if (failure.code === "INVALID_PASSWORD")
    return en.twoStep.setUp.wrongPassword;
  if (failure.code === "INVALID_CODE")
    return en.twoStep.setUp.wrongCode;
  if (failure.status === 401)
    return en.errors.signedOut;
  if (failure.status === 429)
    return failure.message || en.signIn.tooMany;
  return en.signIn.failed;
}

/**
 * The setup key an authenticator app takes when its camera cannot scan the
 * code: the secret from the otpauth:// address, in groups of four, as the
 * apps show it. Empty if the address carries none.
 */
export function setUpKey(totpURI: string): string {
  let secret: string | null = null;
  try {
    secret = new URL(totpURI).searchParams.get("secret");
  }
  catch {
    return "";
  }
  return (secret ?? "").toUpperCase().match(/.{1,4}/g)?.join(" ") ?? "";
}

/** A code as typed: spaces, which some apps show in the middle, are not part of it. */
export function typedCode(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * A backup code as typed, in the shape it was printed: ten digits, five and
 * five with a hyphen between, which someone copying it from paper may leave
 * out or type as a space.
 */
export function typedBackupCode(text: string): string {
  const typed = text.replace(/\s+/g, "");
  return /^\d{10}$/.test(typed) ? `${typed.slice(0, 5)}-${typed.slice(5)}` : typed;
}
