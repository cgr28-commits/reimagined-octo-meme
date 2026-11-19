import { formatGbpAmount, gbpToPence, penceToGbp } from "./gbp";

/** Display the equal share of the whole vehicle fare for an explicitly identified event trip. */
export function eventFareShareLabel(
  totalGbp: number | null | undefined,
  journey: { eventTransfer?: boolean; eventName?: string; passengers: number | null },
): string | null {
  const { passengers } = journey;
  if (!(journey.eventTransfer || journey.eventName?.trim()) ||
      passengers == null || !Number.isInteger(passengers) || passengers < 2 ||
      totalGbp == null || !Number.isFinite(totalGbp) || totalGbp <= 0) return null;

  const pennies = gbpToPence(totalGbp);
  const each = formatGbpAmount(penceToGbp(Math.round(pennies / passengers)));
  return `${pennies % passengers === 0 ? "" : "About "}${each} each for ${passengers} sharing`;
}
