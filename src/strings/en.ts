/**
 * Every word a member of staff reads, in one place.
 *
 * Screens import from here and never write text inline, so a Swahili file can
 * sit beside this one later with the same shape. Plain language: what a person
 * at a service point would say, never a code or a table name.
 */
export const en = {
  app: {
    name: "Brixa HMIS",
    description: "The hospital's daily work, one screen per job.",
  },
  home: {
    notBuiltYet: "The staff screens are being designed. Nothing to use here yet.",
  },
  signIn: {
    title: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    byInvitation: "Accounts are by invitation. If you have none, ask your hospital's administrator to invite you.",
    wrongPassword: "That email and password do not match an account. Check both and try again.",
    notVerified: "Confirm your email address first, with the link we emailed you. Then sign in.",
    tooMany: "Too many attempts. Wait a minute, then try again.",
    failed: "Signing in did not work, on our side. Try again in a moment.",
  },
  session: {
    checking: "Checking that you are signed in…",
    tryAgain: "Try again",
    signedInAs: (name: string) => `Signed in as ${name}`,
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutFailed: "You are still signed in: signing out did not reach the server. Check the connection and try again.",
  },
  errors: {
    notFound: "That is not here, or it is not yours to open.",
    signedOut: "You have been signed out. Sign in again to carry on.",
    notAllowed: "Your role does not allow that.",
    invalid: "Some of what was entered is not valid.",
    failed: "Something went wrong on our side. Try again; if it keeps happening, give this reference to support:",
    offline: "No connection. Check the network and try again.",
  },
} as const;

export type Strings = typeof en;
