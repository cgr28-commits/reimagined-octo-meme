export {
  UK_LOCAL_TIME_LABEL,
  UK_TIME_ZONE,
  formatUkDate,
  formatUkDateTime,
  formatUkInstant,
  formatUkSubmissionTime,
  formatUkTime,
  nowLondonTime,
  todayLondonDate,
} from "../../shared/uk-time";

/** Date-only booking display; preserve the selected calendar date in every time zone. */
export function formatBookingDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}
