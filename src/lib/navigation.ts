/**
 * Where to send someone after they sign in or choose a facility, and how to
 * ask them to.
 *
 * The page they were on rides along in `?next=`, so a session that ends
 * mid-shift brings them back to it. Only a path inside this app is followed:
 * anything else (another site, `//host`, `/\host`) would make these pages an
 * open redirect.
 */
export const SIGN_IN_PATH = "/sign-in";
export const FACILITIES_PATH = "/facilities";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const SET_UP_SIGN_IN_PATH = "/set-up-sign-in";

/** A stand-in origin: a path that resolves anywhere else leaves the app. */
const HERE = "http://brixa.invalid";

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/"))
    return "/";
  // Parsed as the browser will parse it: tabs and newlines dropped, a backslash taken for a slash.
  let url: URL;
  try {
    url = new URL(next, HERE);
  }
  catch {
    return "/";
  }
  // A resolved path can still begin `//` ("/.//host"), which a router reads as another site. Sign-in
  // and its setup are steps on the way, never where someone is heading.
  if (url.origin !== HERE || url.pathname.startsWith("//") || url.pathname === SIGN_IN_PATH || url.pathname === SET_UP_SIGN_IN_PATH)
    return "/";
  return url.pathname + url.search + url.hash;
}

/**
 * A query parameter as the server gives it: one value, several when it
 * repeats, or none. The first wins, as `URLSearchParams.get` decides.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** `target`, remembering the page that sent them there (a path: ids only, never patient data). */
function withNext(target: string, from: string | null | undefined): string {
  const next = safeNext(from);
  return next === "/" ? target : `${target}?next=${encodeURIComponent(next)}`;
}

export function signInHref(from: string | null | undefined): string {
  return withNext(SIGN_IN_PATH, from);
}

/** The way to a forgotten password and back keeps where they were heading. */
export function forgotPasswordHref(from: string | null | undefined): string {
  return withNext(FORGOT_PASSWORD_PATH, from);
}

/** Setting up two-step sign-in, then on to where they were heading. */
export function setUpSignInHref(from: string | null | undefined): string {
  return withNext(SET_UP_SIGN_IN_PATH, from);
}

export function facilitiesHref(from: string): string {
  return withNext(FACILITIES_PATH, from);
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * The record a desk's address names (`?patient=`, `?visit=`): an id, in
 * lower case as the API gives ids, or nothing for anything else, so a
 * mistyped address opens nobody's record.
 */
export function idParam(value: string | null): string | null {
  return value && UUID.test(value) ? value.toLowerCase() : null;
}
