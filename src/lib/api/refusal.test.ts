import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { ApiError, EmptyAnswer, failureText, refusalOf, unwrap } from "./refusal";

describe("what the API refused", () => {
  it("is a refusal with its own words and code, and whatever else it carried", () => {
    const body = { message: "A count of this store is open already: submit or cancel it first", code: "count_open", line: 2 };

    expect(refusalOf(409, body)).toEqual({ kind: "refused", code: "count_open", message: body.message, fields: { line: 2 } });
  });

  it("is not found with nothing more said, so a stranger learns nothing", () => {
    expect(refusalOf(404, { message: "Not Found" })).toEqual({ kind: "not_found" });
  });

  it("is signed out on 401, and not allowed on 403 with the code when there is one", () => {
    expect(refusalOf(401, { message: "Unauthorized" })).toEqual({ kind: "signed_out" });
    expect(refusalOf(403, { message: "Nurses count a ward's store only", code: "ward_store_only" })).toEqual({ kind: "not_allowed", code: "ward_store_only", message: "Nurses count a ward's store only" });
    expect(refusalOf(403, { message: "Forbidden" })).toEqual({ kind: "not_allowed", code: null, message: "Forbidden" });
  });

  it("lists each field that is not valid", () => {
    const body = { success: false, error: { name: "ValidationError", issues: [{ path: ["lines", 0, "quantity"], message: "Too small" }, { path: [], message: "Nothing to change" }] } };

    expect(refusalOf(422, body)).toEqual({ kind: "invalid", issues: [{ path: "lines.0.quantity", message: "Too small" }, { path: "", message: "Nothing to change" }] });
  });

  it("is too many requests on 429, with the limiter's words, which are written for staff", () => {
    expect(refusalOf(429, { message: "Too many requests. Please slow down and try again shortly.", retryAfterSeconds: 30 })).toEqual({ kind: "too_many", message: "Too many requests. Please slow down and try again shortly." });
    expect(failureText(new ApiError(refusalOf(429, { message: "Too many requests. Please slow down and try again shortly." })))).toBe("Too many requests. Please slow down and try again shortly.");
    expect(failureText(new ApiError(refusalOf(429, "")))).toBe(en.errors.tooMany);
  });

  it("is our failure, with the reference to quote, for anything it cannot read", () => {
    expect(refusalOf(500, { message: "Internal Server Error", requestId: "req-1" })).toEqual({ kind: "failed", requestId: "req-1" });
    expect(refusalOf(502, "<html>Bad gateway</html>")).toEqual({ kind: "failed", requestId: null });
    // A 4xx that is not shaped as a refusal is not shown as one.
    expect(refusalOf(409, { message: "odd" })).toEqual({ kind: "failed", requestId: null });
  });
});

describe("what a failed call says", () => {
  it("shows a refusal's own message, written for staff", () => {
    expect(failureText(new ApiError(refusalOf(409, { message: "This visit is closed", code: "visit_closed" })))).toBe("This visit is closed");
    expect(failureText(new ApiError(refusalOf(403, { message: "This facility's account is suspended. Please contact support." })))).toBe("This facility's account is suspended. Please contact support.");
  });

  it("uses a sentence of ours where the API said nothing for staff", () => {
    expect(failureText(new ApiError(refusalOf(404, { message: "Not Found" })))).toBe(en.errors.notFound);
    expect(failureText(new ApiError(refusalOf(422, { success: false, error: { issues: [] } })))).toBe(en.errors.invalid);
    expect(failureText(new ApiError(refusalOf(401, { message: "Unauthorized" })))).toBe(en.errors.signedOut);
  });

  it("gives the reference to quote when there is one", () => {
    expect(failureText(new ApiError(refusalOf(500, { message: "Internal Server Error", requestId: "req-1" })))).toBe(`${en.errors.failed} req-1`);
    expect(failureText(new ApiError(refusalOf(502, "<html>Bad gateway</html>")))).toBe(en.errors.failedNoReference);
  });

  it("says when the request never reached the API", () => {
    expect(failureText(new TypeError("Failed to fetch"))).toBe(en.errors.offline);
  });

  it("never shows a programming error's own words", () => {
    expect(failureText(new Error("Cannot read properties of undefined"))).toBe(en.errors.failedNoReference);
  });
});

describe("unwrapping a typed call", () => {
  it("gives the data", async () => {
    await expect(unwrap(Promise.resolve({ data: { facilities: [] }, response: new Response(null, { status: 200 }) }))).resolves.toEqual({ facilities: [] });
  });

  it("throws the refusal", async () => {
    const call = Promise.resolve({ error: { message: "Unauthorized" }, response: new Response(null, { status: 401 }) });
    await expect(unwrap(call)).rejects.toMatchObject({ refusal: { kind: "signed_out" } });
  });

  it("throws a success that came with no body as an empty answer, not a refusal: the write went through", async () => {
    const call = Promise.resolve({ data: undefined, response: new Response(null, { status: 201 }) });
    await expect(unwrap(call)).rejects.toBeInstanceOf(EmptyAnswer);
  });
});
