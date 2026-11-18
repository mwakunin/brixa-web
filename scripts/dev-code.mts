/**
 * Sign-in codes for the scripts (`pnpm flows`, `pnpm screens`), worked out as
 * an authenticator app works them out (RFC 6238: HMAC-SHA-1, six digits,
 * every 30 seconds).
 */
import { createHmac } from "node:crypto";

/**
 * The development authenticator's secret, shared by every account brixa-api's
 * seed makes (its `src/dev/two-factor.ts`, which must say the same). Public on
 * purpose, and never in production.
 */
export const DEV_TOTP_SECRET = "brixa-dev-totp-secret-not-secret";

/** The code for `secret` (its bytes; a string is taken as UTF-8, as the API takes it) at `at`. */
export function totp(secret: string | Uint8Array, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", typeof secret === "string" ? Buffer.from(secret, "utf8") : secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7FFFFFFF) % 1_000_000).padStart(6, "0");
}

/** A six-digit code that is not the right one now, for a step that checks a wrong code is refused. */
export function wrongCode(secret: string | Uint8Array): string {
  const right = new Set([-30_000, 0, 30_000].map(shift => totp(secret, Date.now() + shift)));
  return ["123456", "654321", "111111"].find(code => !right.has(code))!;
}

/** A setup key as the setup page shows it (base32, in groups of four) back to the secret's bytes. */
export function keyBytes(key: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const character of key.replace(/\s+/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0)
      throw new Error(`not a setup key: ${JSON.stringify(key)}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(bytes);
}
