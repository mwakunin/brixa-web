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
  // A resolved path can still begin `//` ("/.//host"), which a router reads as another site.
  if (url.origin !== HERE || url.pathname.startsWith("//") || url.pathname === SIGN_IN_PATH)
    return "/";
  return url.pathname + url.search + url.hash;
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

export function facilitiesHref(from: string): string {
  return withNext(FACILITIES_PATH, from);
}
