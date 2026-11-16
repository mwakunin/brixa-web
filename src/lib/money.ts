/**
 * Money as the API holds it: integer cents of Kenya shillings.
 *
 * The screens never add money up. A bill's total, what is owed and a shift's
 * takings all come from the API, which derives them; this only prints a figure.
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
