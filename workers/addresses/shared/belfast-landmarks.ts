/**
 * Well-known pickup / drop-off places customers name without an address
 * ("Grand Central", "the Europa", "Titanic Belfast"). The WhatsApp assistant
 * and the Quick Quote parser turn them into a full address label the quote
 * tool can route, so the customer is not asked for a postcode.
 *
 * Labels are full addresses where the postcode is certain; otherwise the
 * place name plus "Belfast", which address lookup resolves. Add entries here
 * rather than special-casing them elsewhere.
 */

export type KnownPlace = {
  /** Address label used for the quote (what the customer sees in the summary). */
  label: string;
  /** Lower-case patterns matched against normalised text (word-bounded). */
  patterns: RegExp[];
};

export const KNOWN_PLACES: KnownPlace[] = [
  {
    // Checked before the station: "Grand Central Hotel" is a different place.
    label: "Grand Central Hotel Belfast, 9-15 Bedford St, Belfast BT2 7FF",
    patterns: [/\bgrand central hotel\b/],
  },
  {
    label: "Grand Central Station, Belfast BT12 5DR",
    patterns: [
      /\bgrand central(?: (?:station|bus station|train station|rail station|transport hub))?\b(?! hotel)/,
      /\bgreat victoria street (?:station|bus station|train station)\b/,
      /\beuropa bus (?:station|centre|center)\b/,
    ],
  },
  {
    label: "Lanyon Place Station, Belfast",
    patterns: [/\blanyon place(?: station| train station)?\b/],
  },
  {
    label: "Europa Hotel, Great Victoria Street, Belfast",
    patterns: [/\b(?:the )?europa hotel\b/, /\bhastings europa\b/],
  },
  {
    label: "Titanic Belfast, Olympic Way, Belfast",
    patterns: [/\btitanic belfast\b/, /\btitanic (?:museum|building|centre|center)\b/],
  },
  {
    label: "SSE Arena, Queen's Quay, Belfast",
    patterns: [/\b(?:the )?sse arena\b/, /\bodyssey arena\b/],
  },
  {
    label: "Belfast City Hospital, Lisburn Rd, Belfast BT9 7AB",
    patterns: [/\bbelfast city hospital\b/, /\bcity hospital\b/],
  },
  {
    label: "Royal Victoria Hospital, Grosvenor Road, Belfast",
    patterns: [/\broyal victoria hospital\b/, /\b(?:the )?royal (?:hospital|vic)\b/],
  },
  {
    label: "Ulster Hospital, Upper Newtownards Road, Dundonald",
    patterns: [/\b(?:the )?ulster hospital\b/],
  },
  {
    label: "Queen's University Belfast, University Road, Belfast",
    patterns: [/\bqueen'?s university\b/, /\bqub\b/],
  },
  {
    label: "Belfast City Hall, Donegall Square, Belfast",
    patterns: [/\bbelfast city hall\b/, /\bcity hall\b/],
  },
];

function normalisePlaceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type KnownPlaceMatch = { label: string; index: number; length: number };

/** Every known place mentioned in the text, in the order they appear. */
export function findKnownPlaces(text: string): KnownPlaceMatch[] {
  const normalised = normalisePlaceText(text);
  const found: KnownPlaceMatch[] = [];
  for (const place of KNOWN_PLACES) {
    for (const pattern of place.patterns) {
      const match = normalised.match(pattern);
      if (match && match.index != null) {
        const overlaps = found.some(
          (f) => match.index! < f.index + f.length && f.index < match.index! + match[0].length,
        );
        if (!overlaps) found.push({ label: place.label, index: match.index, length: match[0].length });
        break;
      }
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** The single known place in the text, if exactly one is named. */
export function knownPlaceLabel(text: string): string | null {
  const found = findKnownPlaces(text);
  return found.length === 1 ? found[0].label : null;
}

/** Normalised copy of the text (same indexes as findKnownPlaces). */
export function normaliseForKnownPlaces(text: string): string {
  return normalisePlaceText(text);
}
