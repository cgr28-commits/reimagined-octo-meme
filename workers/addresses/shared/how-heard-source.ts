/**
 * Customer self-reported "how did you hear about us?" answers from WhatsApp.
 * Stored separately from Google Ads click attribution — customers may not know
 * whether a result was sponsored.
 */

export const HOW_HEARD_SOURCE_KEYS = [
  "google_sponsored_listing",
  "google_search_organic",
  "facebook_social",
  "friend_family",
  "previous_customer",
  "other",
] as const;

export type HowHeardSourceKey = (typeof HOW_HEARD_SOURCE_KEYS)[number];

export type HowHeardOption = {
  number: 1 | 2 | 3 | 4 | 5 | 6;
  key: HowHeardSourceKey;
  /** Short label for owner dashboards. */
  label: string;
  /** Exact line shown in the WhatsApp confirmation. */
  choiceLine: string;
};

export const HOW_HEARD_OPTIONS: readonly HowHeardOption[] = [
  {
    number: 1,
    key: "google_sponsored_listing",
    label: "Google Sponsored Listing (Advert)",
    choiceLine: "1️⃣ Google Sponsored Listing (Advert)",
  },
  {
    number: 2,
    key: "google_search_organic",
    label: "Google Search (Normal Results)",
    choiceLine: "2️⃣ Google Search (Normal Results)",
  },
  {
    number: 3,
    key: "facebook_social",
    label: "Facebook / Social Media",
    choiceLine: "3️⃣ Facebook / Social Media",
  },
  {
    number: 4,
    key: "friend_family",
    label: "Friend or Family Recommendation",
    choiceLine: "4️⃣ Friend or Family Recommendation",
  },
  {
    number: 5,
    key: "previous_customer",
    label: "Previous Customer",
    choiceLine: "5️⃣ Previous Customer",
  },
  {
    number: 6,
    key: "other",
    label: "Other",
    choiceLine: "6️⃣ Other",
  },
] as const;

/** Footer appended under journey details on the WhatsApp booking confirmation. */
export function bookingConfirmedHowHeardFooter(): string {
  const choices = HOW_HEARD_OPTIONS.map((option) => option.choiceLine).join("\n");
  return (
    "\n\n✈️ One quick question!\n\n" +
    "How did you hear about My Airport Taxi NI?\n\n" +
    `${choices}\n\n` +
    "Simply reply with the number — it really helps our small business grow! 💚"
  );
}

const DIGIT_ALIASES: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "1️⃣": 1,
  "2️⃣": 2,
  "3️⃣": 3,
  "4️⃣": 4,
  "5️⃣": 5,
  "6️⃣": 6,
  "1⃣": 1,
  "2⃣": 2,
  "3⃣": 3,
  "4⃣": 4,
  "5⃣": 5,
  "6⃣": 6,
};

/**
 * Parse a WhatsApp reply that is only a how-heard choice (a number 1–6).
 * Longer messages are ignored so the quote bot is not interrupted.
 */
export function parseHowHeardReply(text: string | null | undefined): HowHeardOption | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ");
  const digit = DIGIT_ALIASES[collapsed];
  if (digit) {
    return HOW_HEARD_OPTIONS.find((option) => option.number === digit) ?? null;
  }
  // Allow "1." / "1)" style taps without accepting free text that includes a digit.
  const match = collapsed.match(/^([1-6])(?:[.)]\s*)?$/);
  if (match) {
    const number = Number(match[1]) as HowHeardOption["number"];
    return HOW_HEARD_OPTIONS.find((option) => option.number === number) ?? null;
  }
  return null;
}

export function howHeardThankYouReply(): string {
  return "Thank you — that really helps our small business. Safe travels!";
}

export function howHeardAlreadyRecordedReply(): string {
  return "Thanks — we've already got your answer for this booking.";
}
