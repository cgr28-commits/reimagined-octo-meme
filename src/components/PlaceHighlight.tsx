/**
 * Shows a page heading with the place the page belongs to in brand green.
 * Route headings ("Antrim to Belfast City Airport Taxi") highlight the destination,
 * i.e. the place named after " to "; the pickup stays white. Other headings
 * highlight the first mention. The words themselves are never changed, so the
 * heading reads the same to search engines and screen readers.
 */

/** Where to highlight: [start, end) of the first matching place name, longest names first. */
export function findPlaceHighlight(text: string, places: readonly string[]): [number, number] | null {
  const toIndex = text.indexOf(" to ");
  const from = toIndex >= 0 ? toIndex + 4 : 0;
  const names = [...new Set(places.map((p) => p.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  // Prefer a place named after " to " (the destination); otherwise the first mention.
  for (const start of from > 0 ? [from, 0] : [0]) {
    for (const name of names) {
      const at = text.indexOf(name, start);
      if (at >= 0) return [at, at + name.length];
    }
  }
  return null;
}

export default function PlaceHighlight({ text, places }: { text: string; places: readonly string[] }) {
  const range = findPlaceHighlight(text, places);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <span className="text-emerald" data-place-highlight>
        {text.slice(range[0], range[1])}
      </span>
      {text.slice(range[1])}
    </>
  );
}
