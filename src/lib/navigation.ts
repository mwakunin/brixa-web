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

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/";
  if (next === SIGN_IN_PATH || next.startsWith(`${SIGN_IN_PATH}?`))
    return "/";
  return next;
}

/** `target`, remembering the page that sent them there (a path: ids only, never patient data). */
function withNext(target: string, from: string): string {
  const next = safeNext(from);
  return next === "/" ? target : `${target}?next=${encodeURIComponent(next)}`;
}

export function signInHref(from: string): string {
  return withNext(SIGN_IN_PATH, from);
}

export function facilitiesHref(from: string): string {
  return withNext(FACILITIES_PATH, from);
}
