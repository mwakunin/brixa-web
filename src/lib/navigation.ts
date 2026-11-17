/**
 * Where to send someone after they sign in, and how to ask them to.
 *
 * The page they were on rides along in `?next=`, so a session that ends
 * mid-shift brings them back to it. Only a path inside this app is followed:
 * anything else (another site, `//host`, `/\host`) would make the sign-in
 * page an open redirect.
 */
export const SIGN_IN_PATH = "/sign-in";

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/";
  if (next === SIGN_IN_PATH || next.startsWith(`${SIGN_IN_PATH}?`))
    return "/";
  return next;
}

/** The sign-in page, remembering the page that asked for it (a path: ids only, never patient data). */
export function signInHref(from: string): string {
  const next = safeNext(from);
  return next === "/" ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}
