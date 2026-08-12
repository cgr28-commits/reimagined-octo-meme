import { parseLondonLocalDateTime } from "../../shared/uk-time";

export {
  UK_TIME_ZONE,
  parseLondonLocalDateTime,
  parseLondonLocalIso,
} from "../../shared/uk-time";

/** True when the London pickup is at least `hours` ahead of now. */
export function isPickupAtLeastHoursAhead(
  tripDate: string,
  tripTime: string,
  hours: number,
  now = new Date(),
): boolean {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickup) {
    return false;
  }
  return pickup.getTime() - now.getTime() >= hours * 60 * 60 * 1000;
}
