import { describe, expect, it } from "vitest";

import { en } from "@/strings/en";

import { codeFailure, setUpFailureText, setUpKey, typedBackupCode, typedCode } from "./two-step";

describe("what a refused code says", () => {
  it("says a wrong code is wrong, and keeps them at the code", () => {
    expect(codeFailure({ status: 401, code: "INVALID_CODE", message: "Invalid code" })).toEqual({ text: en.twoStep.wrongCode, startAgain: false });
    expect(codeFailure({ status: 401, code: "INVALID_BACKUP_CODE", message: "Invalid backup code" })).toEqual({ text: en.twoStep.wrongBackupCode, startAgain: false });
  });

  it("sends them back to the password when the sign-in has run out, or the account is locked", () => {
    expect(codeFailure({ status: 401, code: "INVALID_TWO_FACTOR_COOKIE" })).toEqual({ text: en.twoStep.expired, startAgain: true });
    expect(codeFailure({ status: 400, code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" })).toEqual({ text: en.twoStep.expired, startAgain: true });
    // A 429 from Better Auth, whose English is not shown.
    expect(codeFailure({ status: 429, code: "ACCOUNT_TEMPORARILY_LOCKED", message: "Too many failed verification attempts." })).toEqual({ text: en.twoStep.locked, startAgain: true });
  });

  it("shows the API's rate limiter's own message", () => {
    expect(codeFailure({ status: 429, message: "Too many requests. Please slow down and try again shortly." }).text).toBe("Too many requests. Please slow down and try again shortly.");
    expect(codeFailure({ status: 429 }).text).toBe(en.signIn.tooMany);
  });

  it("says when the request never reached the API, and nothing of Better Auth's own otherwise", () => {
    expect(codeFailure(null)).toEqual({ text: en.errors.offline, startAgain: false });
    expect(codeFailure({ status: 400, code: "TRUST_DEVICE_NOT_ALLOWED", message: "This computer cannot be remembered" }).text).toBe(en.signIn.failed);
  });
});

describe("what a refusal while setting up says", () => {
  it("names a wrong password and a wrong first code", () => {
    expect(setUpFailureText({ status: 400, code: "INVALID_PASSWORD", message: "Invalid password" })).toBe(en.twoStep.setUp.wrongPassword);
    expect(setUpFailureText({ status: 401, code: "INVALID_CODE", message: "Invalid code" })).toBe(en.twoStep.setUp.wrongCode);
  });

  it("says when the session has gone, or the request never arrived", () => {
    expect(setUpFailureText({ status: 401, code: "UNAUTHORIZED" })).toBe(en.errors.signedOut);
    expect(setUpFailureText(null)).toBe(en.errors.offline);
    expect(setUpFailureText({ status: 500 })).toBe(en.signIn.failed);
  });
});

describe("the setup key", () => {
  it("is the address's secret in groups of four", () => {
    expect(setUpKey("otpauth://totp/Brixa%20HMIS:a%40b.test?secret=MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U&issuer=Brixa+HMIS")).toBe("MFRG GZDF MZTW Q2LK NNWG 23TP OBYX E43U");
  });

  it("is empty for an address with no secret, or no address at all", () => {
    expect(setUpKey("otpauth://totp/Brixa%20HMIS:a%40b.test?issuer=Brixa+HMIS")).toBe("");
    expect(setUpKey("not an address")).toBe("");
  });
});

describe("a typed code", () => {
  it("drops the spaces some apps show in the middle", () => {
    expect(typedCode(" 123 456 ")).toBe("123456");
  });

  it("puts back a backup code's hyphen, left out or typed as a space", () => {
    expect(typedBackupCode("12345-67890")).toBe("12345-67890");
    expect(typedBackupCode("1234567890")).toBe("12345-67890");
    expect(typedBackupCode(" 12345 67890 ")).toBe("12345-67890");
    // Anything else is sent as it is, for the API to judge.
    expect(typedBackupCode("devbk-00001")).toBe("devbk-00001");
    expect(typedBackupCode("123456789")).toBe("123456789");
  });
});
