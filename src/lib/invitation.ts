import { ApiError, failureText, refusalOf } from "@/lib/api/refusal";
import { en } from "@/strings/en";

/**
 * What a refused invitation says.
 *
 * `POST /invitations/accept` answers each refusal with a message written for
 * the person accepting: the link is not valid, has expired, was accepted
 * already, the facility is suspended, a new account needs a password, too
 * many attempts. Those are shown as they are, whatever their status. A
 * password the API's schema refuses (422 with issues, no message) gets a
 * sentence of ours; anything else is what any failed call says.
 */
export function acceptFailureText(status: number, body: unknown): string {
  const message = typeof body === "object" && body !== null && "message" in body ? body.message : null;
  if (status < 500 && typeof message === "string" && message.length > 0)
    return message;
  if (status === 422)
    return en.newPassword.rules;
  return failureText(new ApiError(refusalOf(status, body)));
}
