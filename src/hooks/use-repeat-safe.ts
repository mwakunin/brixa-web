"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type Action, ActionStore, ANSWER_WAIT_MS, READY, settle, toSend, waitingIn, type WriteState } from "@/lib/api/repeat-safe";

/** This tab's actions: in memory only, like everything the API returned. */
const actions = new ActionStore();

/**
 * One repeat-safe write for a screen to send (`lib/api/repeat-safe.ts`),
 * named for what it is about ("start:<patient id>"), so the same action is
 * found again by any screen that sends it.
 *
 * `send` sends the action's body under its key, and stops waiting when the
 * signal says so. A press while the action is being sent does nothing. A
 * press after no answer came sends it again as it was first sent, under the
 * same key, whatever the press asks for: the screen offers only Try again
 * then. Any answer ends the action, and the next press is a new one.
 *
 * An action waiting for its answer outlives the screen that sent it: shown
 * again, the screen finds it sending, or with no answer and Try again.
 */
export function useRepeatSafe<Body, Result>(name: string, send: (action: Action<Body>, signal: AbortSignal) => Promise<Result>) {
  const watch = useCallback((changed: () => void) => actions.watch(name, changed), [name]);
  const read = useCallback(() => actions.get(name) as WriteState<Body, Result>, [name]);
  const state = useSyncExternalStore(watch, read, () => READY);

  /** Sends the action, and gives where it ended: done, refused, or no answer. A press while one is sent gives that one's state. */
  async function press(body: Body): Promise<WriteState<Body, Result>> {
    // Read from the store, not the render, so two presses before React renders again share one action.
    const current = actions.get(name) as WriteState<Body, Result>;
    if (current.kind === "sending")
      return current;
    const action = toSend(waitingIn(current), body);
    actions.set(name, { kind: "sending", action });
    let ended: WriteState<Body, Result>;
    try {
      ended = settle(action, { ok: true, result: await send(action, AbortSignal.timeout(ANSWER_WAIT_MS)) });
    }
    catch (error) {
      ended = settle<Body, Result>(action, { ok: false, error });
    }
    actions.set(name, ended);
    return ended;
  }

  return { state, press };
}

/** What the action `name` sent, while it waits for its answer: for a screen shown again to show it as it was sent. */
export function waitingBody<Body>(name: string): Body | null {
  return (waitingIn(actions.get(name))?.body as Body | undefined) ?? null;
}
