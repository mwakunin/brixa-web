import { describe, expect, it } from "vitest";

import { refusalOf } from "./refusal";

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

  it("is our failure, with the reference to quote, for anything it cannot read", () => {
    expect(refusalOf(500, { message: "Internal Server Error", requestId: "req-1" })).toEqual({ kind: "failed", requestId: "req-1" });
    expect(refusalOf(502, "<html>Bad gateway</html>")).toEqual({ kind: "failed", requestId: null });
    // A 4xx that is not shaped as a refusal is not shown as one.
    expect(refusalOf(409, { message: "odd" })).toEqual({ kind: "failed", requestId: null });
  });
});
