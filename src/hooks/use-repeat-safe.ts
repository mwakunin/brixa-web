"use client";

import { useRef, useState } from "react";

import { type Action, ANSWER_WAIT_MS, settle, toSend, waitingIn, type WriteState } from "@/lib/api/repeat-safe";

/**
 * One repeat-safe write for a screen to send (`lib/api/repeat-safe.ts`).
 *
 * `send` sends the action's body under its key, and stops waiting when the
 * signal says so. A press while the action is being sent does nothing. A
 * press after no answer came sends it again as it was first sent, under the
 * same key, whatever the press asks for: the screen offers only Try again
 * then. Any answer ends the action, and the next press is a new one.
 *
 * The waiting action lasts as long as the screen that sent it. Leaving it
 * drops the key, so pressing again later is a new action: a write that did
 * go through is then the API's to refuse.
 */
export function useRepeatSafe<Body, Result>(send: (action: Action<Body>, signal: AbortSignal) => Promise<Result>) {
  const [state, setState] = useState<WriteState<Body, Result>>({ kind: "ready" });
  // Kept beside the state so that two presses before React renders again still share one action.
  const latest = useRef(state);

  function move(next: WriteState<Body, Result>) {
    latest.current = next;
    setState(next);
  }

  /** Sends the action, and gives where it ended: done, refused, or no answer. A press while one is sent gives that one's state. */
  async function press(body: Body): Promise<WriteState<Body, Result>> {
    if (latest.current.kind === "sending")
      return latest.current;
    const action = toSend(waitingIn(latest.current), body);
    move({ kind: "sending", action });
    let ended: WriteState<Body, Result>;
    try {
      ended = settle(action, { ok: true, result: await send(action, AbortSignal.timeout(ANSWER_WAIT_MS)) });
    }
    catch (error) {
      ended = settle<Body, Result>(action, { ok: false, error });
    }
    move(ended);
    return ended;
  }

  return { state, press };
}
