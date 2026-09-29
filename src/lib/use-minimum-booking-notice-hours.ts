"use client";

import { useEffect, useState } from "react";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_SHORT_NOTICE_LEAD_HOURS,
  normalizeMinimumBookingNoticeHours,
  SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
} from "../../shared/booking-notice";
import { fetchPublicBookingNotice } from "@/lib/short-notice-api";

/** Fetches the Worker-authoritative notice period, lead time, and confirmation window. */
export function useMinimumBookingNoticeHours(): [
  number,
  (hours: number) => void,
  number,
  number,
] {
  const [hours, setHours] = useState(MINIMUM_BOOKING_NOTICE_HOURS);
  const [leadHours, setLeadHours] = useState(MINIMUM_SHORT_NOTICE_LEAD_HOURS);
  const [confirmationWindowHours, setConfirmationWindowHours] = useState(
    SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchPublicBookingNotice().then((value) => {
      if (cancelled) return;
      setHours(value.minimumBookingNoticeHours);
      setLeadHours(value.minimumShortNoticeLeadHours);
      setConfirmationWindowHours(value.shortNoticeConfirmationWindowHours);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return [
    hours,
    (value) => setHours(normalizeMinimumBookingNoticeHours(value)),
    leadHours,
    confirmationWindowHours,
  ];
}
