"use client";

import { useEffect, useState } from "react";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  normalizeMinimumBookingNoticeHours,
} from "../../shared/booking-notice";
import { fetchPublicMinimumBookingNoticeHours } from "@/lib/short-notice-api";

/** Fetches the Worker-authoritative short-notice period. Falls back to 12. */
export function useMinimumBookingNoticeHours(): [
  number,
  (hours: number) => void,
] {
  const [hours, setHours] = useState(MINIMUM_BOOKING_NOTICE_HOURS);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicMinimumBookingNoticeHours().then((value) => {
      if (!cancelled) setHours(normalizeMinimumBookingNoticeHours(value));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return [hours, (value) => setHours(normalizeMinimumBookingNoticeHours(value))];
}
