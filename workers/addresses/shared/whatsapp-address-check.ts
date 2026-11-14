/**
 * WhatsApp address check: an address typed without a postcode (e.g. "7 Glen Manor Road")
 * is looked up on Google and the customer confirms the full address with postcode before
 * it goes on the quote. Pure helpers — the Worker does the Google lookups.
 */
import type {
  WhatsAppAddressCheck,
  WhatsAppAddressField,
  WhatsAppAddressOption,
  WhatsAppBotButton,
  WhatsAppBotList,
  WhatsAppConversation,
} from "./whatsapp-quote-bot";

/** Max matches offered (each costs a Place Details lookup). */
export const WHATSAPP_ADDRESS_MAX_OPTIONS = 3;

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const EIRCODE = /\b[AC-FHKNPRTV-Y]\d{2}\s?[AC-FHKNPRTV-Y\d]{4}\b/i;

/** Already a full UK postcode or Eircode in the address — nothing to look up. */
export function hasFullPostcode(address: string): boolean {
  return UK_POSTCODE.test(address) || EIRCODE.test(address);
}

const placeIdField = (field: WhatsAppAddressField) =>
  field === "pickupAddress" ? "pickupPlaceId" : "dropoffPlaceId";

/**
 * The address (if any) that still needs looking up: not the airport end, not already
 * confirmed, no full postcode, and not looked up before.
 */
export function whatsAppAddressFieldToCheck(
  conversation: WhatsAppConversation,
  options: { includePostcoded?: boolean } = {},
): WhatsAppAddressField | null {
  const draft = conversation.draft;
  for (const field of ["pickupAddress", "dropoffAddress"] as const) {
    const value = draft[field]?.trim();
    if (!value) continue;
    if (draft.airportCode && (field === "pickupAddress") === Boolean(draft.fromAirport)) continue;
    if (draft[placeIdField(field)]) continue;
    // Claude-led chat confirms every typed address (town + postcode shown), postcode or not.
    if (!options.includePostcoded && hasFullPostcode(value)) continue;
    if (conversation.addressChecked?.includes(value)) continue;
    return field;
  }
  return null;
}

/**
 * A confirmed place only belongs to the exact address it was confirmed for; if the
 * customer later changes that address, the stale place is dropped.
 */
export function clearStaleWhatsAppPlaces(conversation: WhatsAppConversation, before: WhatsAppConversation | null): void {
  for (const field of ["pickupAddress", "dropoffAddress"] as const) {
    const id = placeIdField(field);
    if (conversation.draft[id] && before && conversation.draft[field] !== before.draft[field] && before.draft[id] === conversation.draft[id]) {
      delete conversation.draft[id];
    }
  }
}

const ADDRESS_NONE = "address none";
const addressChoiceId = (index: number) => `txt:address ${index + 1}`;

export type WhatsAppAddressPrompt = { text: string; buttons?: WhatsAppBotButton[]; list?: WhatsAppBotList };

/** "Is this the right address?" (one match) or "Which is yours?" (several). */
export function buildWhatsAppAddressPrompt(check: WhatsAppAddressCheck): WhatsAppAddressPrompt {
  const which = check.field === "pickupAddress" ? "pickup" : "destination";
  if (check.options.length === 1) {
    return {
      text: `Is this the right ${which} address?\n\n📍 ${check.options[0]!.address}`,
      buttons: [
        { id: addressChoiceId(0), title: "✅ Yes, that's right" },
        { id: `txt:${ADDRESS_NONE}`, title: "✏️ No, change it" },
      ],
    };
  }
  const lines = check.options.map((o, i) => `${i + 1}. ${o.address}`);
  return {
    text: `I found a few matches for "${check.typed}". Which is your ${which} address?\n\n${lines.join("\n")}`,
    list: {
      button: "Choose address",
      rows: [
        ...check.options.map((o, i) => {
          const [first, ...rest] = o.address.split(",");
          return {
            id: addressChoiceId(i),
            title: `${i + 1}. ${first!.trim()}`.slice(0, 24),
            ...(rest.length ? { description: rest.join(",").trim().slice(0, 72) } : {}),
          };
        }),
        { id: `txt:${ADDRESS_NONE}`, title: "None of these" },
      ],
    },
  };
}

/** Asked when the customer says none of the matches is right. */
export function buildWhatsAppAddressRetry(field: WhatsAppAddressField): string {
  return field === "pickupAddress"
    ? "No problem. Please send the full pickup address, including the postcode."
    : "No problem. Please send the full destination address, including the postcode.";
}

/**
 * The customer's answer to a pending check: a chosen option, "none", or null when they
 * wrote something else (then the message is handled as normal journey text).
 */
export function parseWhatsAppAddressReply(
  text: string,
  check: WhatsAppAddressCheck,
): { kind: "pick"; option: WhatsAppAddressOption } | { kind: "none" } | null {
  const t = text.replace(/[*_~]/g, "").trim().toLowerCase().replace(/[.!]+$/, "");
  // "address 2" (the list), or typed: "2", "Number 2", "option 2", "no. 2", "the second one".
  const ordinals: Record<string, number> = { first: 1, second: 2, third: 3, "1st": 1, "2nd": 2, "3rd": 3 };
  const m =
    t.match(/^(?:(?:address|number|no|option|choice|#)\s*\.?\s*)?(\d)(?:\s+(?:one|please|thanks|thank you))?$/) ??
    t.match(/^(?:it'?s\s+|the\s+)?(first|second|third|1st|2nd|3rd)(?:\s+(?:one|address|option))?(?:\s+(?:please|thanks))?$/);
  if (m) {
    const n = /^\d$/.test(m[1]!) ? Number(m[1]) : ordinals[m[1]!]!;
    const option = check.options[n - 1];
    return option ? { kind: "pick", option } : null;
  }
  if (t === ADDRESS_NONE || /^(no|nope|none|none of these|wrong|not right)$/.test(t)) return { kind: "none" };
  if (check.options.length === 1 && /^(yes|yeah|yep|y|correct|that'?s right|thats it|that's it)$/.test(t)) {
    return { kind: "pick", option: check.options[0]! };
  }
  return null;
}

/** Customer-facing full address with postcode from a Google place (no trailing country). */
export function whatsAppFullAddress(place: {
  displayAddress?: string | null;
  formattedAddress?: string | null;
  postalCode?: string | null;
}): string {
  let address = (place.displayAddress || place.formattedAddress || "")
    .replace(/,\s*(UK|United Kingdom|Ireland|Northern Ireland)\s*$/i, "")
    .trim();
  const postcode = place.postalCode?.trim();
  if (postcode && !address.toUpperCase().replace(/\s/g, "").includes(postcode.toUpperCase().replace(/\s/g, ""))) {
    address = `${address} ${postcode}`;
  }
  return address;
}

/**
 * Sent when Google can't find a typed place (e.g. a hotel name spelt wrong): the customer
 * is asked to check it rather than being quoted for it as typed (12 Nov 2026).
 */
export function whatsAppAddressNotFoundReply(field: WhatsAppAddressField, typed: string): string {
  const which = field === "pickupAddress" ? "pickup" : "destination";
  return (
    `I couldn't find "${typed}" on the map. Could you check the name, or send the ${which} ` +
    "street address or postcode instead?"
  );
}
