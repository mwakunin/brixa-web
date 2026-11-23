import { en } from "@/strings/en";

/**
 * What the API said when it did not do what was asked, as the screen needs it.
 *
 * The API's shapes (brixa-api, `.claude/rules/ecc/typescript/patterns.md`):
 *
 *   401            { message }                      not signed in
 *   403            { message, code? }               the role does not allow it
 *   404            { message }                      not there, or not yours
 *   409 and others { message, code, ...fields }     a refusal, written for the user
 *   429            { message, retryAfterSeconds }   too many requests, written for the user
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
    | { kind: "too_many"; message: string | null }
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

/** A refusal, thrown, so a query or mutation holds it as its error. */
export class ApiError extends Error {
  constructor(readonly refusal: Refusal) {
    super(`The API answered ${refusal.kind}`);
    this.name = "ApiError";
  }
}

/**
 * A success that came with no body where one was due. For a write, what was
 * done went through but its answer is unknown: it is no answer, not a
 * refusal, so the action keeps its key (`repeat-safe.ts`).
 */
export class EmptyAnswer extends Error {
  constructor(readonly status: number) {
    super(`The API answered ${status} with no body`);
    this.name = "EmptyAnswer";
  }
}

/** The data of a typed call (`api.GET(...)`), or its refusal thrown as an `ApiError`. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (error === undefined && data === undefined && response.ok)
    throw new EmptyAnswer(response.status);
  if (error !== undefined || data === undefined)
    throw new ApiError(refusalOf(response.status, error));
  return data;
}

/**
 * What a failed call says to the person at the desk. A refusal's own message
 * is shown as it is; everything else gets a sentence of ours. `fetch` throws
 * a TypeError when the request never reached the API.
 */
export function failureText(error: unknown): string {
  if (!(error instanceof ApiError))
    return error instanceof TypeError ? en.errors.offline : en.errors.failedNoReference;
  const refusal = error.refusal;
  switch (refusal.kind) {
    case "signed_out": return en.errors.signedOut;
    case "not_allowed": return refusal.message ?? en.errors.notAllowed;
    case "not_found": return en.errors.notFound;
    case "refused": return refusal.message;
    case "invalid": return en.errors.invalid;
    case "too_many": return refusal.message ?? en.errors.tooMany;
    case "failed": return refusal.requestId ? `${en.errors.failed} ${refusal.requestId}` : en.errors.failedNoReference;
  }
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
  if (status === 429)
    return { kind: "too_many", message: text(fields.message) };
  const code = text(fields.code);
  const message = text(fields.message);
  if (status < 500 && code && message) {
    const rest = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "code" && key !== "message"));
    return { kind: "refused", code, message, fields: rest };
  }
  return { kind: "failed", requestId: text(fields.requestId) };
}
