/**
 * Central journey address normalisation for display, storage, owner dashboard,
 * and area classification.
 *
 * Fixes polluted strings such as:
 * - "22 Sunnyside Drive, 22 Sunnyside Dr, Belfast…" → "22 Sunnyside Dr, Belfast…"
 * - "11 1-11 May St, Belfast…" → "1-11 May St, Belfast…"
 */

/** House/building token: 11, 11A, or a range like 1-11 / 1–11 / 1/11. */
const LEADING_BUILDING_TOKEN =
  String.raw`\d+[a-zA-Z]?(?:\s*[-–—/]\s*\d+[a-zA-Z]?)?`;

const HAS_LEADING_BUILDING_RE = new RegExp(
  `^${LEADING_BUILDING_TOKEN}(?:\\s|,|$)`,
  "i",
);

const EXTRACT_LEADING_NUMBER_RE = /^(\d+[a-zA-Z]?)\s+/;

const STREET_TYPE_NORMALISE: Array<[RegExp, string]> = [
  [/\b(avenue|ave)\b/gi, "ave"],
  [/\b(road|rd)\b/gi, "rd"],
  [/\b(street|st)\b/gi, "st"],
  [/\b(drive|dr)\b/gi, "dr"],
  [/\b(lane|ln)\b/gi, "ln"],
  [/\b(close|cl)\b/gi, "cl"],
  [/\b(court|ct)\b/gi, "ct"],
  [/\b(crescent|cres)\b/gi, "cres"],
  [/\b(terrace|ter)\b/gi, "ter"],
  [/\b(boulevard|blvd)\b/gi, "blvd"],
  [/\b(place|pl)\b/gi, "pl"],
  [/\b(square|sq)\b/gi, "sq"],
  [/\b(gardens|gdns)\b/gi, "gdns"],
  [/\b(park|pk)\b/gi, "pk"],
  [/\b(mount|mt)\b/gi, "mt"],
];

export function normaliseJourneyAddressCompareKey(value: string): string {
  let text = value
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of STREET_TYPE_NORMALISE) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Extract a simple leading house number from typed input ("11 May St" → "11"). */
export function extractLeadingStreetNumber(input: string): string | null {
  const match = input.trim().match(EXTRACT_LEADING_NUMBER_RE);
  return match ? match[1] : null;
}

/**
 * True when text already starts with a house/building number or range
 * (11, 11A, 1-11, 1–11, …). Ranges must count so we never prepend "11" onto
 * "1-11 May St".
 */
export function hasLeadingStreetNumber(text: string): boolean {
  return HAS_LEADING_BUILDING_RE.test(text.trim());
}

/** Prepend a typed house number only when the address line has none / no range. */
export function withStreetNumber(number: string, addressLine: string): string {
  const trimmed = addressLine.trim();
  const num = number.trim();
  if (!trimmed || !num) return trimmed;
  if (hasLeadingStreetNumber(trimmed)) {
    return trimmed;
  }
  return `${num} ${trimmed}`;
}

function looksLikeStreetAddressLine(value: string): boolean {
  return /^\d+[a-zA-Z]?\s+\S+/.test(value.trim()) || HAS_LEADING_BUILDING_RE.test(value.trim());
}

function streetLinesEquivalent(a: string, b: string): boolean {
  const aKey = normaliseJourneyAddressCompareKey(a);
  const bKey = normaliseJourneyAddressCompareKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  if (aKey.startsWith(`${bKey} `) || bKey.startsWith(`${aKey} `)) return true;

  if (looksLikeStreetAddressLine(a) && looksLikeStreetAddressLine(b)) {
    const aNum = a.match(/^(\d+[a-zA-Z]?)\b/i)?.[1]?.toLowerCase();
    const bNum = b.match(/^(\d+[a-zA-Z]?)\b/i)?.[1]?.toLowerCase();
    if (aNum && bNum && aNum === bNum) {
      const aRest = aKey.replace(/^\d+[a-z]*\s+/, "");
      const bRest = bKey.replace(/^\d+[a-z]*\s+/, "");
      if (aRest && bRest && (aRest === bRest || aRest.startsWith(bRest) || bRest.startsWith(aRest))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Drop a redundant standalone number before an existing number/range:
 * "11 1-11 May St, Belfast…" → "1-11 May St, Belfast…"
 * "18 18 Collingwood Ave…" → "18 Collingwood Ave…"
 */
export function stripRedundantLeadingNumberPrefix(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  const match = trimmed.match(
    new RegExp(`^(\\d+[a-zA-Z]?)\\s+(${LEADING_BUILDING_TOKEN})(\\s|,|$)`, "i"),
  );
  if (!match) return trimmed;

  const prefix = match[1].toLowerCase();
  const following = match[2].toLowerCase().replace(/\s+/g, "");
  if (following === prefix) {
    return trimmed.slice(match[1].length).trimStart();
  }

  const rangeParts = following.split(/[-–—/]/);
  if (rangeParts.length === 2) {
    const prefixNum = Number.parseInt(prefix, 10);
    const aNum = Number.parseInt(rangeParts[0], 10);
    const bNum = Number.parseInt(rangeParts[1], 10);
    if (
      Number.isFinite(prefixNum) &&
      Number.isFinite(aNum) &&
      Number.isFinite(bNum)
    ) {
      const lo = Math.min(aNum, bNum);
      const hi = Math.max(aNum, bNum);
      if (prefixNum >= lo && prefixNum <= hi) {
        return trimmed.slice(match[1].length).trimStart();
      }
    }
  }

  return trimmed;
}

/**
 * Collapse duplicated leading street lines caused by Avenue/Ave (etc.) mismatch.
 * Safe to run on already-clean addresses — returns them unchanged.
 */
export function collapseDuplicateStreetAddressLabel(label: string): string {
  const trimmed = stripRedundantLeadingNumberPrefix(label);
  if (!trimmed) return "";

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return trimmed;

  while (parts.length >= 2 && streetLinesEquivalent(parts[0], parts[1])) {
    parts.shift();
  }

  return parts.join(", ");
}

/** Normalise a pickup/destination label before save, display, or classification. */
export function normaliseJourneyAddressLabel(label: string | null | undefined): string {
  return collapseDuplicateStreetAddressLabel(String(label ?? ""));
}
