import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { resetFailure, resetRequestFailureText } from "./password-reset";

describe("what a failed request for a reset link says", () => {
  it("shows the rate limiter's own message, or a plain one when it has none", () => {
    expect(resetRequestFailureText({ status: 429, message: "Too many requests. Please slow down and try again shortly." })).toBe("Too many requests. Please slow down and try again shortly.");
    expect(resetRequestFailureText({ status: 429 })).toBe(en.signIn.tooMany);
  });

  it("says when the request never reached the API", () => {
    expect(resetRequestFailureText(null)).toBe(en.errors.offline);
  });

  it("never shows Better Auth's own English", () => {
    expect(resetRequestFailureText({ status: 500, message: "Internal Server Error" })).toBe(en.passwordReset.failed);
  });
});

describe("what a failed reset says", () => {
  it("offers a new link when this one has expired or was used", () => {
    expect(resetFailure({ status: 400, code: "INVALID_TOKEN", message: "Invalid token" })).toEqual({ text: en.passwordReset.linkInvalid, askAgain: true });
  });

  it("explains a password the API refused for its length", () => {
    expect(resetFailure({ status: 400, code: "PASSWORD_TOO_SHORT", message: "Password too short" })).toEqual({ text: en.newPassword.rules, askAgain: false });
    expect(resetFailure({ status: 400, code: "PASSWORD_TOO_LONG", message: "Password too long" })).toEqual({ text: en.newPassword.rules, askAgain: false });
  });

  it("shows the rate limiter's own message", () => {
    expect(resetFailure({ status: 429, message: "Too many requests. Please slow down and try again shortly." })).toEqual({ text: "Too many requests. Please slow down and try again shortly.", askAgain: false });
  });

  it("says when the request never reached the API, and never shows Better Auth's own English", () => {
    expect(resetFailure(null)).toEqual({ text: en.errors.offline, askAgain: false });
    expect(resetFailure({ status: 500, message: "Internal Server Error" })).toEqual({ text: en.passwordReset.failed, askAgain: false });
  });
});
