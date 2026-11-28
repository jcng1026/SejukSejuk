// Guardrail stages 1 and 5 (design §6). Pure functions: no model, no database.

import { SYSTEM_PROMPT_CANARY } from "./prompt";

export const MAX_QUESTION_LENGTH = 500;

export type ScreenResult = { ok: true } | { ok: false; reason: string };

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
// Any control character except tab and newline.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ENCODED_BLOB = /[A-Za-z0-9+/=]{120,}/;

const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(instructions?|rules|prompts?|guardrails?|above|previous|prior)\b/,
  /\bsystem\s*prompt\b/,
  /\b(reveal|print|show|repeat|leak|dump|output)\b.{0,30}\b(instructions?|prompt|rules|configuration|config)\b/,
  /\b(api|secret|access|service)\s*keys?\b|\bpasswords?\b|\btokens?\b/,
  /\byou are now\b|\bdeveloper mode\b|\bjailbreak\b|\bdo anything now\b|\bdan mode\b/,
  /\bact as\b|\bpretend (to be|you)\b|\brole-?play as\b/,
  /<\|[^|]*\|>|^\s*#{2,}\s*(system|assistant|user)\b|\[(system|assistant)\]|<\/?(system|assistant)>/m,
  /;\s*(drop|delete|update|insert|alter|truncate|grant)\b|\bunion\s+(all\s+)?select\b/,
];

/** Lower-case, fold full-width and other look-alike forms, drop zero-width characters. */
function normalise(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase().replace(/\s+/g, " ");
}

/** Stage 1: cheap checks before any model sees the text (FR-AI-4). */
export function screenInput(text: string): ScreenResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_QUESTION_LENGTH) return { ok: false, reason: "too_long" };
  if (CONTROL.test(trimmed)) return { ok: false, reason: "control_chars" };
  if (ENCODED_BLOB.test(trimmed)) return { ok: false, reason: "encoded" };
  const plain = normalise(trimmed);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(plain))
    ? { ok: false, reason: "injection" }
    : { ok: true };
}

export interface SeenInTools {
  orderNos: ReadonlySet<string>;
  /** Stored form, e.g. "60123334455". */
  phones: ReadonlySet<string>;
  /** Customer addresses the tools returned, as stored. */
  addresses: ReadonlySet<string>;
}

const ORDER_NO = /ORD-\d{6}-\d{4}/gi;
/** Digit runs a phone could hide in: 012-333 4455, (03) 5544 3322, +60.12.333.4455 … */
const DIGIT_RUN = /\+?\(?\d[\d\s.()-]{7,18}\d/g;
/** Street words that start a Malaysian address line. */
const STREET =
  /\b(?:jalan|jln|lorong|lrg|persiaran|lebuh|taman|tmn)\s+[a-z0-9/]+(?:\s+[a-z0-9/]+)?/gi;

/** A Malaysian number in stored form ("60…"), or null when the digits are not a phone. */
function asStoredPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const stored = digits.startsWith("0") ? `6${digits}` : digits;
  return /^60\d{8,10}$/.test(stored) ? stored : null;
}

/**
 * Stage 5: the answer may only repeat order numbers, phone numbers and street
 * addresses that this request's tools returned, and never the system prompt.
 */
export function screenOutput(answer: string, seen: SeenInTools): ScreenResult {
  if (answer.trim().length === 0) return { ok: false, reason: "empty" };
  if (answer.includes(SYSTEM_PROMPT_CANARY)) return { ok: false, reason: "prompt_leak" };
  for (const orderNo of answer.match(ORDER_NO) ?? []) {
    if (!seen.orderNos.has(orderNo.toUpperCase())) return { ok: false, reason: "unseen_order" };
  }
  // Order numbers are checked above; drop them so their digits are not read as phones.
  const rest = answer.replace(ORDER_NO, " ");
  for (const run of rest.match(DIGIT_RUN) ?? []) {
    const phone = asStoredPhone(run);
    if (phone && !seen.phones.has(phone)) return { ok: false, reason: "unseen_phone" };
  }
  const addresses = [...seen.addresses].map((address) =>
    address.toLowerCase().replace(/\s+/g, " "),
  );
  for (const street of rest.match(STREET) ?? []) {
    const needle = street.toLowerCase().replace(/\s+/g, " ");
    if (!addresses.some((address) => address.includes(needle))) {
      return { ok: false, reason: "unseen_address" };
    }
  }
  return { ok: true };
}
