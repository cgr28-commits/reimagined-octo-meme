/** 25% supplement for address-to-address trips on weekend nights and bank holidays. */
export const POINT_TO_POINT_PREMIUM_RATE = 0.25;

/** Northern Ireland bank holidays (inclusive). Update annually. */
const NI_BANK_HOLIDAY_DATES = new Set([
  // 2025
  "2025-01-01",
  "2025-03-17",
  "2025-04-18",
  "2025-04-21",
  "2025-05-05",
  "2025-05-26",
  "2025-07-12",
  "2025-07-14",
  "2025-08-25",
  "2025-12-25",
  "2025-12-26",
  // 2026
  "2026-01-01",
  "2026-03-17",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-07-13",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  // 2027
  "2027-01-01",
  "2027-03-17",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-07-12",
  "2027-07-13",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

export type TripSchedule = {
  outboundDate?: string;
  outboundTime?: string;
  returnDate?: string;
  returnTime?: string;
  returnJourney?: boolean;
};

function parseLocalDateTime(date: string, time: string): Date | null {
  if (!date || !time) {
    return null;
  }

  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPremiumReason(date: string, time: string): string | null {
  if (NI_BANK_HOLIDAY_DATES.has(date)) {
    return "Bank holiday";
  }

  const parsed = parseLocalDateTime(date, time);
  if (!parsed) {
    return null;
  }

  const day = parsed.getDay();
  const hour = parsed.getHours();

  // After midnight on Friday → Saturday 00:00–05:59
  if (day === 6 && hour < 6) {
    return "Friday night";
  }

  // After midnight on Saturday → Sunday 00:00–05:59
  if (day === 0 && hour < 6) {
    return "Saturday night";
  }

  return null;
}

export function isPointToPointPremiumDateTime(date: string, time: string): boolean {
  return getPremiumReason(date, time) !== null;
}

export function describePointToPointPremium(schedule: TripSchedule): string | null {
  const reasons = new Set<string>();

  if (schedule.outboundDate && schedule.outboundTime) {
    const reason = getPremiumReason(schedule.outboundDate, schedule.outboundTime);
    if (reason) {
      reasons.add(reason);
    }
  }

  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    const reason = getPremiumReason(schedule.returnDate, schedule.returnTime);
    if (reason) {
      reasons.add(reason);
    }
  }

  if (reasons.size === 0) {
    return null;
  }

  return [...reasons].join(" · ");
}

export function applyPointToPointPremium(
  oneWayFare: number,
  schedule: TripSchedule,
): { total: number; premiumApplied: boolean; premiumAmount: number } {
  const baseTotal = schedule.returnJourney ? oneWayFare * 2 : oneWayFare;
  let premiumAmount = 0;

  if (schedule.outboundDate && schedule.outboundTime) {
    if (isPointToPointPremiumDateTime(schedule.outboundDate, schedule.outboundTime)) {
      premiumAmount += oneWayFare * POINT_TO_POINT_PREMIUM_RATE;
    }
  }

  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    if (isPointToPointPremiumDateTime(schedule.returnDate, schedule.returnTime)) {
      premiumAmount += oneWayFare * POINT_TO_POINT_PREMIUM_RATE;
    }
  }

  return {
    total: baseTotal + premiumAmount,
    premiumApplied: premiumAmount > 0,
    premiumAmount,
  };
}
