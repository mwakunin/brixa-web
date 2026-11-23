"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type Action, ActionStore, ANSWER_WAIT_MS, READY, settle, toSend, waitingIn, type WriteState } from "@/lib/api/repeat-safe";
import { chosenFacilityId } from "@/lib/facility";

/** This tab's actions: in memory only, like everything the API returned. */
const actions = new ActionStore();

/**
 * An action's name at the facility this tab works in: one left waiting at
 * another facility is that facility's, and its Try again is never sent here.
 */
function atFacility(name: string): string {
  return `${chosenFacilityId() ?? ""}/${name}`;
}

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
 * again, the screen finds it sending, or with no answer and Try again. An
 * answer that comes while a screen shows the action is its to act on, from
 * `state`: the press that sent it may have been left with its screen.
 */
export function useRepeatSafe<Body, Result>(name: string, send: (action: Action<Body>, signal: AbortSignal) => Promise<Result>) {
  const scoped = atFacility(name);
  const watch = useCallback((changed: () => void) => actions.watch(scoped, changed), [scoped]);
  const read = useCallback(() => actions.get(scoped) as WriteState<Body, Result>, [scoped]);
  const state = useSyncExternalStore(watch, read, () => READY);

  /** Sends the action, and gives where it ended: done, refused, or no answer. A press while one is sent gives that one's state. */
  async function press(body: Body): Promise<WriteState<Body, Result>> {
    // Read from the store, not the render, so two presses before React renders again share one action.
    const current = actions.get(scoped) as WriteState<Body, Result>;
    if (current.kind === "sending")
      return current;
    const action = toSend(waitingIn(current), body);
    actions.set(scoped, { kind: "sending", action });
    let ended: WriteState<Body, Result>;
    try {
      ended = settle(action, { ok: true, result: await send(action, AbortSignal.timeout(ANSWER_WAIT_MS)) });
    }
    catch (error) {
      ended = settle<Body, Result>(action, { ok: false, error });
    }
    actions.set(scoped, ended);
    return ended;
  }

  return { state, press };
}

/** What the action `name` sent, while it waits for its answer: for a screen shown again to show it as it was sent. */
export function waitingBody<Body>(name: string): Body | null {
  return (waitingIn(actions.get(atFacility(name)))?.body as Body | undefined) ?? null;
}
