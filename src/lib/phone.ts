/**
 * A phone number as staff read it. The API keeps numbers in E.164
 * (`+254712345678`); a Kenyan one is printed as it is dialled at home,
 * `0712 345 678`, and any other as it was given, with its country code.
 */
export function printedPhone(e164: string): string {
  const kenyan = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return kenyan ? `0${kenyan[1]} ${kenyan[2]} ${kenyan[3]}` : e164;
}
