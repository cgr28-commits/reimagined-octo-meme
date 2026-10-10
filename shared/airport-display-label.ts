/** Display-only: an identified airport must not be confused with Dublin city. */
export function airportDisplayLabel(label: string, airportCode?: string | null): string {
  const text = label.trim();
  if (airportCode !== "DUB" || /\bdublin\s+airport\b/i.test(text)) return text;
  if (/^(?:Dublin|DUB)$/i.test(text)) return "Dublin Airport";
  return `Dublin Airport, ${text}`;
}
