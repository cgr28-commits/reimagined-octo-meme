"use client";

import {
  matchWebsiteEventNotice,
  websiteEventDatesLabel,
  websiteEventIcon,
  websiteEventReason,
} from "../../shared/website-event-notices";
import {
  CARD_BALANCE_MIN_FARE_GBP,
  isCardBalanceDateEligible,
} from "../../shared/deposit-card-balance";
import { useCardBalanceDepositEnabled } from "@/lib/use-card-balance-deposit-enabled";

type Props = {
  addresses: Array<string | undefined>;
  dates: Array<string | undefined>;
  dropoff?: string;
  /** Pickup date/time and fare: the 20% deposit line shows only when a deposit is offered. */
  tripDate?: string;
  tripTime?: string;
  fareGbp?: number | null;
};

/** Big-event notice on the quote result (Garth Brooks, Six Nations, big Dublin/Belfast gigs). */
export default function EventDemandNotice({ addresses, dates, dropoff, tripDate, tripTime, fareGbp }: Props) {
  const cardBalanceDepositEnabled = useCardBalanceDepositEnabled();
  const event = matchWebsiteEventNotice({ pickup: addresses[0], dropoff: dropoff ?? addresses[1], dates });
  if (!event) return null;
  const depositOffered =
    cardBalanceDepositEnabled &&
    fareGbp != null && fareGbp >= CARD_BALANCE_MIN_FARE_GBP && isCardBalanceDateEligible(tripDate, tripTime);
  return (
    <div
      role="status"
      data-event-demand-notice={event.id}
      className="mb-2 rounded-xl border-2 border-[#F5B700] bg-[#FFF4D6] px-3.5 py-2.5 text-left text-navy"
    >
      <p className="text-sm font-bold leading-snug">
        <span aria-hidden="true">{websiteEventIcon(event)} </span>
        {event.title} – {websiteEventDatesLabel(event)}
      </p>
      <p className="mt-0.5 text-[0.82rem] font-medium leading-snug">
        Limited availability due to {websiteEventReason(event)}. Booking early is advisable to secure your car.
      </p>
      {depositOffered ? (
        <p className="mt-1 text-[0.82rem] font-bold leading-snug" data-event-demand-deposit>
          Only a 20% deposit is needed to secure your booking.
        </p>
      ) : null}
    </div>
  );
}
