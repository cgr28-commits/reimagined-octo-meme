"use client";

import { useEffect, useState } from "react";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_SHORT_NOTICE_LEAD_HOURS,
  normalizeMinimumBookingNoticeHours,
} from "../../shared/booking-notice";
import { fetchPublicBookingNotice } from "@/lib/short-notice-api";

/** Fetches the Worker-authoritative notice period and short-notice lead time. */
export function useMinimumBookingNoticeHours(): [
  number,
  (hours: number) => void,
  number,
] {
  const [hours, setHours] = useState(MINIMUM_BOOKING_NOTICE_HOURS);
  const [leadHours, setLeadHours] = useState(MINIMUM_SHORT_NOTICE_LEAD_HOURS);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicBookingNotice().then((value) => {
      if (cancelled) return;
      setHours(value.minimumBookingNoticeHours);
      setLeadHours(value.minimumShortNoticeLeadHours);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return [
    hours,
    (value) => setHours(normalizeMinimumBookingNoticeHours(value)),
    leadHours,
  ];
}
