/** "How did you hear about us?" — optional question at the booking details step (owner, 13 Nov 2026). */
export const HEARD_ABOUT_OPTIONS = [
  "Google search",
  "Google ad",
  "Google Maps",
  "Facebook or Instagram",
  "Friend or family",
  "Used you before",
  "Hotel or venue",
  "Other",
] as const;

export type HeardAbout = (typeof HEARD_ABOUT_OPTIONS)[number];

/** Only the listed answers are kept; anything else is dropped. */
export function parseHeardAbout(value: unknown): HeardAbout | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return (HEARD_ABOUT_OPTIONS as readonly string[]).includes(trimmed) ? (trimmed as HeardAbout) : undefined;
}

export function formatHeardAboutLine(details: { heardAbout?: string }): string | null {
  const answer = parseHeardAbout(details.heardAbout);
  return answer ? `How they heard about us: ${answer}` : null;
}
