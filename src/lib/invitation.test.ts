import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { acceptFailureText } from "./invitation";

describe("what a refused invitation says", () => {
  it("shows the API's own words for each refusal, whatever its status", () => {
    expect(acceptFailureText(404, { message: "This invitation link is not valid", code: "not_found" })).toBe("This invitation link is not valid");
    expect(acceptFailureText(410, { message: "This invitation has expired. Ask the facility admin to invite you again.", code: "expired" })).toBe("This invitation has expired. Ask the facility admin to invite you again.");
    expect(acceptFailureText(409, { message: "This invitation has already been accepted. Sign in instead.", code: "already_accepted" })).toBe("This invitation has already been accepted. Sign in instead.");
    expect(acceptFailureText(422, { message: "Choose a password to set up your account", code: "password_required" })).toBe("Choose a password to set up your account");
    expect(acceptFailureText(429, { message: "Too many requests. Please slow down and try again shortly.", retryAfterSeconds: 30 })).toBe("Too many requests. Please slow down and try again shortly.");
  });

  it("explains a password the API's schema refused, which carries no message", () => {
    expect(acceptFailureText(422, { success: false, error: { issues: [{ path: ["password"], message: "Too small: expected string to have >=10 characters" }] } })).toBe(en.newPassword.rules);
  });

  it("never shows a server error's own words", () => {
    expect(acceptFailureText(500, { message: "Internal Server Error", requestId: "req-1" })).toBe(`${en.errors.failed} req-1`);
    expect(acceptFailureText(502, "<html>Bad gateway</html>")).toBe(en.errors.failedNoReference);
  });
});
