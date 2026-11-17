import { en } from "@/strings/en";

/**
 * What a failed sign-in says to the person at the desk.
 *
 * Better Auth answers with its own codes and English that was not written for
 * staff, so each case it can give is named here. The API's rate limiter
 * answers 429 with a message written for staff, which is shown as it is.
 * `null` means the request never reached the API.
 */
export interface SignInFailure {
  status: number;
  code?: string;
  message?: string;
}

export function signInFailureText(failure: SignInFailure | null): string {
  if (failure === null)
    return en.errors.offline;
  if (failure.code === "EMAIL_NOT_VERIFIED")
    return en.signIn.notVerified;
  if (failure.status === 400 || failure.status === 401)
    return en.signIn.wrongPassword;
  if (failure.status === 429)
    return failure.message || en.signIn.tooMany;
  return en.signIn.failed;
}
