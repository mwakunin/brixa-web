import { describe, expect, it } from "vitest";

import { ApiError, EmptyAnswer, refusalOf } from "./refusal";
import { ActionStore, noAnswer, sentIn, settle, toSend, waitingIn } from "./repeat-safe";

const visit: { patientId: string; kind: "opd" | "emergency" } = { patientId: "p-1", kind: "opd" };

describe("one key for one action", () => {
  it("is made at the first press, in the shape the API takes", () => {
    const action = toSend(null, visit);

    expect(action.body).toEqual(visit);
    expect(action.key).toMatch(/^[\w.:-]{8,200}$/);
  });

  it("is a new one for each new action", () => {
    expect(toSend(null, visit).key).not.toBe(toSend(null, visit).key);
  });

  it("is sent again, with what was first sent, by every press until an answer comes", () => {
    const first = toSend(null, visit);
    const sent = settle(first, { ok: false, error: new TypeError("Failed to fetch") });

    const again = toSend(waitingIn(sent), { ...visit, kind: "emergency" });

    expect(again).toBe(first);
  });

  it("is over once an answer comes, done or refused, so the next press makes a new key", () => {
    const first = toSend(null, visit);
    const done = settle(first, { ok: true, result: { id: "e-1" } });
    const refused = settle(first, { ok: false, error: new ApiError(refusalOf(409, { message: "This patient already has an open visit of that kind", code: "already_open" })) });

    expect(done).toEqual({ kind: "done", result: { id: "e-1" } });
    expect(refused.kind).toBe("refused");
    expect(waitingIn(done)).toBeNull();
    expect(waitingIn(refused)).toBeNull();
    expect(toSend(waitingIn(refused), visit).key).not.toBe(first.key);
  });

  it("keeps what a refused action sent, for its form to be shown again, though it no longer waits", () => {
    const first = toSend(null, visit);
    const refused = settle(first, { ok: false, error: new ApiError(refusalOf(409, { message: "Refused", code: "refused" })) });

    expect(waitingIn(refused)).toBeNull();
    expect(sentIn(refused)).toBe(first);
    expect(sentIn(settle(first, { ok: true, result: {} }))).toBeNull();
  });

  it("stays waiting while it is being sent", () => {
    const first = toSend(null, visit);

    expect(waitingIn({ kind: "sending", action: first })).toBe(first);
  });
});

describe("no answer", () => {
  it("is a request that did not get through, or whose answer did not come in time", () => {
    expect(noAnswer(new TypeError("Failed to fetch"))).toBe(true);
    expect(noAnswer(new DOMException("The operation timed out.", "TimeoutError"))).toBe(true);
    expect(noAnswer(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
  });

  it("is a gateway's failure in front of the API, which cannot say whether the write was done", () => {
    for (const status of [502, 503, 504])
      expect(noAnswer(new ApiError(refusalOf(status, "<html>Bad gateway</html>"), status)), String(status)).toBe(true);
  });

  it("is a success whose body could not be read, or came empty: the write went through, what it returned is unknown", () => {
    expect(noAnswer(new SyntaxError("Unexpected end of JSON input"))).toBe(true);
    expect(noAnswer(new EmptyAnswer(201))).toBe(true);
  });

  it("is not an answer the API gave, even our own failure", () => {
    expect(noAnswer(new ApiError(refusalOf(500, { message: "Internal Server Error", requestId: "req-1" }), 500))).toBe(false);
    expect(noAnswer(new ApiError(refusalOf(409, { message: "Refused", code: "refused" })))).toBe(false);
    expect(noAnswer(new Error("something else"))).toBe(false);
  });
});

describe("the actions a tab keeps", () => {
  const sent = toSend(null, visit);

  it("keep one waiting for its answer after its screen is left, with its key, for Try again", () => {
    const store = new ActionStore();
    const leave = store.watch("start:p-1", () => {});
    store.set("start:p-1", settle(sent, { ok: false, error: new TypeError("Failed to fetch") }));

    leave();

    expect(waitingIn(store.get("start:p-1"))).toBe(sent);
  });

  it("forget one that has ended once its screen is left, so its Done goes with the patient", () => {
    const store = new ActionStore();
    const leave = store.watch("start:p-1", () => {});
    store.set("start:p-1", { kind: "done", result: { id: "e-1" } });

    leave();

    expect(store.get("start:p-1")).toEqual({ kind: "ready" });
  });

  it("keep an answer that comes after the screen was left until a screen has shown it, then forget it", () => {
    const store = new ActionStore();
    store.set("tests:p-1", { kind: "sending", action: sent });
    store.set("tests:p-1", { kind: "done", result: { id: "o-1" } });

    expect(store.get("tests:p-1").kind).toBe("done");

    const leave = store.watch("tests:p-1", () => {});
    leave();

    expect(store.get("tests:p-1").kind).toBe("ready");
  });



  it("tell each screen watching an action of its changes, and only that action's", () => {
    const store = new ActionStore();
    const seen: string[] = [];
    store.watch("start:p-1", () => seen.push("p-1"));
    store.watch("start:p-2", () => seen.push("p-2"));

    store.set("start:p-1", { kind: "sending", action: sent });

    expect(seen).toEqual(["p-1"]);
  });
});
