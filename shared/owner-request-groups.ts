/**
 * Owner Enquiries — how website requests are grouped on the dashboard.
 *
 * - "new":        no price sent yet and the trip is today or later → needs the owner now.
 * - "priceSent":  price emailed, waiting for the customer to pay.
 * - "booked":     paid (or otherwise no longer waiting on payment).
 * - "past":       never booked and the trip date has gone → kept out of the way.
 */

import type { BookingJobRecord } from "./booking-job";
import { todayLondonDate } from "./uk-time";

export type OwnerRequestGroups = {
  new: BookingJobRecord[];
  priceSent: BookingJobRecord[];
  booked: BookingJobRecord[];
  past: BookingJobRecord[];
};

function tripIsPast(job: BookingJobRecord, today: string): boolean {
  // A request whose outbound date has gone can't be priced any more, even if it had a return.
  const outbound = job.tripDate?.trim() || "";
  return Boolean(outbound) && outbound < today;
}

export function ownerRequestNeedsPrice(job: BookingJobRecord, today: string): boolean {
  return job.status === "awaiting_payment" && !job.sentQuoteAt && !tripIsPast(job, today);
}

const newestFirst = (a: BookingJobRecord, b: BookingJobRecord) =>
  (b.createdAt || "").localeCompare(a.createdAt || "");
const soonestFirst = (a: BookingJobRecord, b: BookingJobRecord) =>
  `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`);

export function groupOwnerRequests(
  jobs: BookingJobRecord[],
  today: string = todayLondonDate(),
): OwnerRequestGroups {
  const groups: OwnerRequestGroups = { new: [], priceSent: [], booked: [], past: [] };
  for (const job of jobs) {
    if (job.status === "cancelled") continue;
    if (job.status !== "awaiting_payment") {
      groups.booked.push(job);
    } else if (tripIsPast(job, today)) {
      groups.past.push(job);
    } else if (job.sentQuoteAt) {
      groups.priceSent.push(job);
    } else {
      groups.new.push(job);
    }
  }
  groups.new.sort(newestFirst);
  groups.priceSent.sort(newestFirst);
  groups.booked.sort(soonestFirst);
  groups.past.sort(newestFirst);
  return groups;
}
