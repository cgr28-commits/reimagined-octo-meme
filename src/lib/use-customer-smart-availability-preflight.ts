"use client";

import { useEffect } from "react";
import { checkCustomerSmartAvailability } from "@/lib/customer-smart-availability-client";
import type {
  CustomerBookingAvailabilityInput,
  CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";

/** Hide Pay before SumUp on locked quote pages. Fail-open if the check cannot run. */
export function useCustomerSmartAvailabilityPreflight(
  booking: CustomerBookingAvailabilityInput | null,
  onBlocked: (message: string, alternativeTimes: CustomerPublicAlternativeTime[]) => void,
): void {
  const pickup = booking?.pickupLabel ?? "";
  const dropoff = booking?.dropoffLabel ?? "";
  const tripDate = booking?.tripDate ?? "";
  const tripTime = booking?.tripTime ?? "";
  const returnJourney = booking?.returnJourney === true;
  const returnDate = booking?.returnDate ?? "";
  const returnTime = booking?.returnTime ?? "";
  const airportCode = booking?.airportCode ?? "";
  const isFromAirport = booking?.isFromAirport === true;
  const routeDurationMinutes = booking?.routeDurationMinutes ?? null;

  useEffect(() => {
    if (!pickup.trim() || !dropoff.trim() || !tripDate.trim() || !tripTime.trim()) {
      return;
    }
    let cancelled = false;
    void checkCustomerSmartAvailability({
      pickupLabel: pickup,
      dropoffLabel: dropoff,
      tripDate,
      tripTime,
      returnJourney,
      returnDate,
      returnTime,
      airportCode,
      isFromAirport,
      routeDurationMinutes,
    }).then((result) => {
      if (cancelled || !result.blocked) return;
      onBlocked(
        result.customerMessage || "",
        result.alternativeTimes,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    airportCode,
    dropoff,
    isFromAirport,
    onBlocked,
    pickup,
    returnDate,
    returnJourney,
    returnTime,
    routeDurationMinutes,
    tripDate,
    tripTime,
  ]);
}
