/**
 * Money as the API holds it: integer cents of Kenya shillings.
 *
 * The screens never add money up. A bill's total, what is owed and a shift's
 * takings all come from the API, which derives them; this prints a figure, and
 * reads one typed in.
 * Amounts charged and paid are whole shillings, so cents are printed only when
 * there are some (a unit price of KES 2.50 a tablet).
 */
export function formatKes(cents: number): string {
  if (!Number.isSafeInteger(cents))
    throw new RangeError("Money is a whole number of cents");
  const sign = cents < 0 ? "-" : "";
  const whole = Math.trunc(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const shillings = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}KES ${shillings}${rest === 0 ? "" : `.${rest.toString().padStart(2, "0")}`}`;
}

/** The most the API takes as one amount: KES 20,000,000. */
const MOST_CENTS = 2_000_000_000;

/**
 * An amount a member of staff typed, in whole shillings, as cents: "2000",
 * "2,000" or "2 000". Nothing for anything else, such as a decimal, a sign
 * or more than the API takes: the screen asks again rather than guess.
 */
export function centsFromShillings(typed: string): number | null {
  const text = typed.trim();
  if (!/^(?:\d+|\d{1,3}(?:[, ]\d{3})+)$/.test(text))
    return null;
  const cents = Number(text.replace(/[, ]/g, "")) * 100;
  return cents <= MOST_CENTS ? cents : null;
}
