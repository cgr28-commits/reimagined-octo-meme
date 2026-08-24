export type DisplayCount = number | string;

function isSingular(count: DisplayCount): boolean {
  return typeof count === "number" ? count === 1 : count.trim() === "1";
}

export function formatPassengerCount(count: DisplayCount): string {
  return `${count} ${isSingular(count) ? "passenger" : "passengers"}`;
}

export function formatSuitcaseCount(count: DisplayCount): string {
  return `${count} ${isSingular(count) ? "suitcase" : "suitcases"}`;
}

export function formatPassengerSuitcaseCounts(
  passengers: DisplayCount | null | undefined,
  suitcases: DisplayCount | null | undefined,
): string {
  const parts: string[] = [];
  if (passengers != null) parts.push(formatPassengerCount(passengers));
  if (suitcases != null) parts.push(formatSuitcaseCount(suitcases));
  return parts.join(" • ");
}
