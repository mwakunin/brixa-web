import { createAuthClient } from "better-auth/react";
import { describe, expect, it } from "vitest";

import { deadline } from "./auth-client";

/**
 * An API that sends its headers and the start of a body, then nothing more.
 * Its body ends only when the request's signal aborts, as a real stalled
 * connection would end when the browser gives up.
 */
const seen = { bodyStarted: false, abortedDuringBody: false };
const stalled: typeof fetch = async (_input, init) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      seen.bodyStarted = true;
      controller.enqueue(new TextEncoder().encode("{\"status\":"));
      init?.signal?.addEventListener("abort", () => {
        seen.abortedDuringBody = true;
        controller.error(init.signal?.reason);
      });
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
};

describe("a deadline on a request", () => {
  it("ends a request whose answer stalls part way through its body", async () => {
    const client = createAuthClient({ baseURL: "http://api.test", fetchOptions: { customFetchImpl: stalled } });
    const asked = Date.now();

    const outcome = await client.requestPasswordReset({ email: "someone@example.test", fetchOptions: deadline(200) })
      .then(answer => (answer.error ? "error" : "answered"), () => "thrown");

    // The request reached the stalled body, and the deadline ended it there: not some earlier failure.
    expect(seen).toEqual({ bodyStarted: true, abortedDuringBody: true });
    expect(outcome).not.toBe("answered");
    expect(Date.now() - asked).toBeLessThan(2_000);
  });
});
