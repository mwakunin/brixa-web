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
