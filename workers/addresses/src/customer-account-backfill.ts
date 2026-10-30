/**
 * One-off backfill: index paid bookings made before My bookings existed, so returning
 * customers can see their history straight away. Runs from the hourly cron and does
 * nothing once the flag is set.
 */
import { CUSTOMER_INDEX_BACKFILL_FLAG, indexPaidBookingForCustomer } from "./customer-account-store";
import { listPaidBookingsCreatedSince } from "./paid-booking-store";

function ymdDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function backfillCustomerBookingIndex(
  store: KVNamespace,
): Promise<{ ran: boolean; indexed: number }> {
  if (await store.get(CUSTOMER_INDEX_BACKFILL_FLAG)) return { ran: false, indexed: 0 };
  const records = await listPaidBookingsCreatedSince(store, ymdDaysAgo(399), { limit: 800 });
  let indexed = 0;
  for (const record of records) {
    await indexPaidBookingForCustomer(store, record);
    indexed += 1;
  }
  await store.put(CUSTOMER_INDEX_BACKFILL_FLAG, new Date().toISOString());
  return { ran: true, indexed };
}
