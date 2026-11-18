import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { resetFailure, resetRequestFailureText } from "./password-reset";

describe("what a failed request for a reset link says", () => {
  it("shows the rate limiter's own message, or a plain one when it has none", () => {
    expect(resetRequestFailureText({ status: 429, message: "Too many requests. Please slow down and try again shortly." })).toBe("Too many requests. Please slow down and try again shortly.");
    expect(resetRequestFailureText({ status: 429 })).toBe(en.signIn.tooMany);
  });

  it("asks for the address to be checked when the API cannot read it as one", () => {
    expect(resetRequestFailureText({ status: 400, code: "VALIDATION_ERROR", message: "[body.email] Invalid email address" })).toBe(en.passwordReset.checkEmail);
  });

  it("says when the request never reached the API", () => {
    expect(resetRequestFailureText(null)).toBe(en.errors.offline);
  });

  it("never shows Better Auth's own English", () => {
    expect(resetRequestFailureText({ status: 500, message: "Internal Server Error" })).toBe(en.passwordReset.failed);
  });
});

describe("what a failed reset says", () => {
  const invalidLink = { status: 400, code: "INVALID_TOKEN", message: "Invalid token" };

  it("offers a new link when this one has expired or was used", () => {
    expect(resetFailure(invalidLink)).toEqual({ text: en.passwordReset.linkInvalid, askAgain: true, mayHaveChanged: false });
  });

  it("says the password may have changed already when an earlier answer was lost, without claiming it did", () => {
    expect(resetFailure(invalidLink, { answerLost: true })).toEqual({ text: en.passwordReset.mayHaveChanged, askAgain: true, mayHaveChanged: true });
  });

  it("explains a password the API refused as too short, or as too long", () => {
    expect(resetFailure({ status: 400, code: "PASSWORD_TOO_SHORT", message: "Password too short" })).toEqual({ text: en.newPassword.rules, askAgain: false, mayHaveChanged: false });
    expect(resetFailure({ status: 400, code: "PASSWORD_TOO_LONG", message: "Password too long" })).toEqual({ text: en.newPassword.tooLong, askAgain: false, mayHaveChanged: false });
  });

  it("shows the rate limiter's own message", () => {
    expect(resetFailure({ status: 429, message: "Too many requests. Please slow down and try again shortly." })).toEqual({ text: "Too many requests. Please slow down and try again shortly.", askAgain: false, mayHaveChanged: false });
  });

  it("says when the request never reached the API, and never shows Better Auth's own English", () => {
    expect(resetFailure(null)).toEqual({ text: en.errors.offline, askAgain: false, mayHaveChanged: false });
    expect(resetFailure({ status: 500, message: "Internal Server Error" })).toEqual({ text: en.passwordReset.failed, askAgain: false, mayHaveChanged: false });
  });
});
