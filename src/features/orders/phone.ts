// Malaysian phone numbers, stored as 60XXXXXXXXX (country code, no leading 0),
// which is also the format wa.me links need (SRS FR-ORD-3).

/** Stored form; matches the orders.customer_phone CHECK used by new rows. */
export const STORED_PHONE = /^60[1-9][0-9]{7,9}$/;

export function isStoredPhone(value: string): boolean {
  return STORED_PHONE.test(value);
}

/** Normalises what a person types ("012-345 6789", "+60 12…") or returns null. */
export function normalizeMalaysianPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[0-9\s\-().]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, "");
  let national: string;
  if (digits.startsWith("60")) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else return null;

  const stored = `60${national}`;
  return isStoredPhone(stored) ? stored : null;
}

/** Display form: mobiles 01X-XXX XXXX / 011-XXXX XXXX, landlines 0X-XXXX XXXX. */
export function formatPhone(stored: string): string {
  const local = `0${stored.slice(2)}`;
  const prefixLength = local.startsWith("01") ? 3 : 2;
  const prefix = local.slice(0, prefixLength);
  const rest = local.slice(prefixLength);
  const split = rest.length - 4;
  return `${prefix}-${rest.slice(0, split)} ${rest.slice(split)}`;
}
