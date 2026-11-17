import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { signInFailureText } from "./sign-in";

describe("what a failed sign-in says", () => {
  it("says the email and password do not match, without saying which", () => {
    expect(signInFailureText({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" })).toBe(en.signIn.wrongPassword);
    expect(signInFailureText({ status: 400, code: "INVALID_EMAIL" })).toBe(en.signIn.wrongPassword);
  });

  it("asks for the email address to be confirmed first", () => {
    expect(signInFailureText({ status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" })).toBe(en.signIn.notVerified);
  });

  it("shows the rate limiter's own message, or a plain one when it has none", () => {
    expect(signInFailureText({ status: 429, message: "Too many requests. Please slow down and try again shortly." })).toBe("Too many requests. Please slow down and try again shortly.");
    expect(signInFailureText({ status: 429 })).toBe(en.signIn.tooMany);
  });

  it("says when the request never reached the API", () => {
    expect(signInFailureText(null)).toBe(en.errors.offline);
  });

  it("never shows Better Auth's own English for anything else", () => {
    expect(signInFailureText({ status: 403, code: "INVALID_ORIGIN", message: "Invalid origin" })).toBe(en.signIn.failed);
    expect(signInFailureText({ status: 500, message: "Internal Server Error" })).toBe(en.signIn.failed);
  });
});
