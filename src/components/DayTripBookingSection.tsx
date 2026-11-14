/**
 * Day trip page → "Book this day trip" with online payment.
 * Uses the same request form and secure payment link as Event Transfers.
 * Shown only when the online request service is switched on (see the day trip page);
 * otherwise the page keeps its existing enquiry form.
 */
import BespokeRequestForm from "@/components/BespokeRequestForm";
import type { DayTrip } from "../../shared/day-trips";

export default function DayTripBookingSection({ id, dayTrip }: { id?: string; dayTrip: DayTrip }) {
  const prices = [...new Set(dayTrip.options.map((o) => o.priceGbp))].sort((a, b) => a - b);
  return (
    <section id={id} data-day-trip-booking className="glass-card rounded-2xl p-6 sm:p-8">
      <h2 className="text-lg font-bold text-white sm:text-xl">Book this day trip</h2>
      <p className="mb-6 mt-3 text-sm leading-relaxed text-white/65">
        Choose your date and pickup, then pay securely online. {dayTrip.title} is £{prices.join(" or £")} per car (not per person) for up to 4
        passengers collected in Belfast. Attraction entry tickets are not included.
      </p>
      <BespokeRequestForm category="day_trip" dayTrip={dayTrip} />
    </section>
  );
}
