/**
 * What the API said when it did not do what was asked, as the screen needs it.
 *
 * The API's shapes (brixa-api, `.claude/rules/ecc/typescript/patterns.md`):
 *
 *   401            { message }                      not signed in
 *   403            { message, code? }               the role does not allow it
 *   404            { message }                      not there, or not yours
 *   409 and others { message, code, ...fields }     a refusal, written for the user
 *   422            { success: false, error: { issues } }   a field is not valid
 *   500            { message, requestId }           our fault
 *
 * A refusal's `message` is written for the member of staff and is shown as it
 * is. Nothing else from an error is ever shown.
 */
export type Refusal
  = | { kind: "signed_out" }
    | { kind: "not_allowed"; code: string | null; message: string | null }
    | { kind: "not_found" }
    | { kind: "refused"; code: string; message: string; fields: Record<string, unknown> }
    | { kind: "invalid"; issues: { path: string; message: string }[] }
    | { kind: "failed"; requestId: string | null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

function issuesOf(body: Record<string, unknown>): { path: string; message: string }[] {
  const error = isRecord(body.error) ? body.error : {};
  const issues = Array.isArray(error.issues) ? error.issues : [];
  return issues.filter(isRecord).map(issue => ({
    path: Array.isArray(issue.path) ? issue.path.join(".") : "",
    message: text(issue.message) ?? "",
  }));
}

export function refusalOf(status: number, body: unknown): Refusal {
  const fields = isRecord(body) ? body : {};
  if (status === 401)
    return { kind: "signed_out" };
  if (status === 403)
    return { kind: "not_allowed", code: text(fields.code), message: text(fields.message) };
  if (status === 404)
    return { kind: "not_found" };
  if (status === 422)
    return { kind: "invalid", issues: issuesOf(fields) };
  const code = text(fields.code);
  const message = text(fields.message);
  if (status < 500 && code && message) {
    const rest = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "code" && key !== "message"));
    return { kind: "refused", code, message, fields: rest };
  }
  return { kind: "failed", requestId: text(fields.requestId) };
}
