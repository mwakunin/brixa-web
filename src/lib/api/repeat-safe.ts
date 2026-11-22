/**
 * Writes a screen may send again, made safe to repeat (CLAUDE.md §3).
 *
 * One key belongs to one action. It is made at the first press of the
 * button, and every resend of that action carries it, until an answer
 * arrives; the API answers a repeated key with its first answer and does
 * not do the write again. While no answer has come, what was sent is held
 * as sent: an edited body under the same key would be refused, and a new key
 * could repeat a write that did go through. Once any answer arrives, done or
 * refused, the action is over, and the next press makes a new key.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** How long a write waits for its answer before the screen says that none came. */
export const ANSWER_WAIT_MS = 30_000;

/** One action: its key, and what it sends, as it was first sent. */
export interface Action<Body> {
  key: string;
  body: Body;
}

/** 32 random hex digits. Not `crypto.randomUUID`, which a page served over plain http lacks. */
function newKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** What a press sends: the action still waiting for its answer, as it was sent, else a new one. */
export function toSend<Body>(waiting: Action<Body> | null, body: Body): Action<Body> {
  return waiting ?? { key: newKey(), body };
}

/**
 * Whether a write's failure means that no answer came, so the write may or
 * may not have been done: the request did not get through (`fetch` throws a
 * TypeError), or its answer did not come back in time.
 */
export function noAnswer(error: unknown): boolean {
  if (error instanceof TypeError)
    return true;
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Where an action stands, as its screen shows it. */
export type WriteState<Body, Result>
  = | { kind: "ready" }
    | { kind: "sending"; action: Action<Body> }
    | { kind: "no_answer"; action: Action<Body> }
    | { kind: "done"; result: Result }
    | { kind: "refused"; error: unknown };

/** The state once `action` was answered, or failed to be. Only no answer keeps it waiting. */
export function settle<Body, Result>(action: Action<Body>, outcome: { ok: true; result: Result } | { ok: false; error: unknown }): WriteState<Body, Result> {
  if (outcome.ok)
    return { kind: "done", result: outcome.result };
  return noAnswer(outcome.error) ? { kind: "no_answer", action } : { kind: "refused", error: outcome.error };
}

/** The action that is still waiting for its answer in `state`, if any. */
export function waitingIn<Body, Result>(state: WriteState<Body, Result>): Action<Body> | null {
  return state.kind === "sending" || state.kind === "no_answer" ? state.action : null;
}
