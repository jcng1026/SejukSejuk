// Money is integer sen everywhere (NFR-5); these are the only conversions.

const RINGGIT = /^(?:rm\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i;

/** "RM 1,200.50" / "250" / "250.5" → sen, or null when not a valid amount. */
export function parseRinggitToSen(input: string): number | null {
  const match = RINGGIT.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1].replaceAll(",", ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const sen = whole * 100 + cents;
  return Number.isSafeInteger(sen) ? sen : null;
}

const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 120000 → "RM 1,200.00". Integer arithmetic only; never floats on stored values. */
export function formatSen(sen: number): string {
  const whole = Math.trunc(sen / 100);
  const cents = Math.abs(sen % 100);
  return `RM ${RM.format(whole).replace(/\.00$/, "")}.${String(cents).padStart(2, "0")}`;
}
