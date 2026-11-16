/**
 * Dublin toll allowance for address-to-address journeys (owner approved
 * 16 Nov 2026: "I want those tolls added").
 *
 * Dublin Airport transfers already carry a £4 M1 toll allowance per leg in
 * `airport-fixed-costs.ts`. Address-to-address journeys into Dublin city and
 * county had no toll allowance at all. This adds the tolls the driver
 * actually pays on that leg — down AND back, like the airport allowance:
 *
 * - M1 (Gormanston–Monasterboice, Drogheda): every leg that crosses the
 *   plaza — one end north of it (NI / Louth), the other end in Dublin.
 *   £4 per leg, the same allowance Dublin Airport legs use.
 * - Dublin Port Tunnel: when the Dublin end is the city centre / south-east
 *   (reached via the tunnel). Time-of-day TII car rates for each crossing:
 *   southbound Mon–Fri 06:00–10:00 €14 (2026) / €15 (from 2027),
 *   northbound Mon–Fri 16:00–19:00 €12, otherwise €3.50.
 * - M50 (West-Link, J6–J7): when the Dublin end is west / south-west
 *   (reached round the M50). €2.60 (2026) / €2.70 (from 2027) per crossing
 *   with a tag.
 *
 * Euro tolls are converted at EUR_TO_GBP and rounded to the nearest £1 per
 * leg. North Dublin (Swords, Santry, Finglas, Blanchardstown) pays the M1
 * toll only. Dublin Airport and airport-to-airport jobs never use this.
 *
 * The allowance is a fixed cost: never surcharged (Night / Weekend /
 * Christmas) and never reduced by the return discount. Customers see it inside
 * their single fare (presentation unchanged); the owner breakdown shows it as
 * its own lines.
 */

export const DUBLIN_TOLL_EUR_TO_GBP = 0.87;
export const DUBLIN_M1_TOLL_ALLOWANCE_GBP = 4;

/** Drogheda M1 toll plaza latitude (Balgeen). */
const M1_TOLL_PLAZA_LAT = 53.68;

type Point = { lat: number; lng: number };

export type DublinTollZone = "tunnel" | "m50" | "north";

export type DublinTollLeg = {
  leg: "outbound" | "return";
  zone: DublinTollZone;
  m1Gbp: number;
  portTunnelGbp: number;
  m50Gbp: number;
  totalGbp: number;
};

export type DublinTollAllowance = {
  outboundGbp: number;
  returnGbp: number;
  legs: DublinTollLeg[];
};

const NONE: DublinTollAllowance = { outboundGbp: 0, returnGbp: 0, legs: [] };

function validPoint(p: Point | null | undefined): p is Point {
  return Boolean(p) && Number.isFinite(p!.lat) && Number.isFinite(p!.lng) && Math.abs(p!.lat) <= 90 && Math.abs(p!.lng) <= 180;
}

/** Dublin city and county (excludes Dublin Airport, which has its own rules). */
export function isDublinTollAreaPoint(p: Point): boolean {
  if (!(p.lat >= 53.2 && p.lat <= 53.62 && p.lng >= -6.6 && p.lng <= -6.0)) return false;
  // Dublin Airport campus — airport pricing applies instead.
  if (p.lat >= 53.415 && p.lat <= 53.445 && p.lng >= -6.30 && p.lng <= -6.20) return false;
  return true;
}

export function dublinTollZone(p: Point): DublinTollZone {
  if (p.lat < 53.372 && p.lng >= -6.31) return "tunnel";
  if (p.lat < 53.37 && p.lng < -6.31) return "m50";
  return "north";
}

function isDublinText(label: string): boolean {
  const t = ` ${label.toLowerCase()} `;
  if (/\bdublin\s+airport\b/.test(t)) return false;
  return /\bdublin\b|\bco\.?\s*dublin\b|\bd(0[1-9]|1[0-8]|2[0-4]|6w)\b/.test(t);
}

function minutesOf(time?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h < 24 && min >= 0 && min < 60)) return null;
  return h * 60 + min;
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD local date, shifted by whole days. */
function weekdayOf(date: string, dayOffset: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset));
  return d.getUTCDay();
}

function yearOf(date?: string): number {
  const m = /^(\d{4})-/.exec(String(date ?? ""));
  return m ? Number(m[1]) : new Date().getUTCFullYear();
}

/** Port Tunnel car toll (EUR) for one crossing at local minutes from the leg date's midnight. */
export function portTunnelCrossingEur(
  direction: "southbound" | "northbound",
  date: string | undefined,
  minutesFromMidnight: number | null,
): number {
  const offPeak = 3.5;
  if (!date || minutesFromMidnight == null) return offPeak;
  const dayOffset = Math.floor(minutesFromMidnight / 1440);
  const minutes = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const weekday = weekdayOf(date, dayOffset);
  if (weekday == null || weekday === 0 || weekday === 6) return offPeak;
  if (direction === "southbound" && minutes >= 6 * 60 && minutes < 10 * 60) {
    return yearOf(date) >= 2027 ? 15 : 14;
  }
  if (direction === "northbound" && minutes >= 16 * 60 && minutes < 19 * 60) return 12;
  return offPeak;
}

export function m50CrossingEur(date?: string): number {
  return yearOf(date) >= 2027 ? 2.7 : 2.6;
}

/**
 * Toll allowance for an address-to-address job. Coordinates must be
 * server-resolved (the same points the drive-to-pickup charge uses). When
 * coordinates are missing, a Dublin address label still gets the M1 allowance.
 */
export function resolveDublinTollAllowance(input: {
  pickup?: Point | null;
  dropoff?: Point | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  /** Customer road time for one leg (minutes). */
  durationMinutes?: number | null;
  outboundDate?: string;
  outboundTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
}): DublinTollAllowance {
  const pickupLabel = String(input.pickupLabel ?? "");
  const dropoffLabel = String(input.dropoffLabel ?? "");

  let dublinEnd: "pickup" | "dropoff" | null = null;
  let zone: DublinTollZone = "north";

  if (validPoint(input.pickup) && validPoint(input.dropoff)) {
    const pickupDublin = isDublinTollAreaPoint(input.pickup);
    const dropoffDublin = isDublinTollAreaPoint(input.dropoff);
    if (pickupDublin === dropoffDublin) return NONE;
    const other = pickupDublin ? input.dropoff : input.pickup;
    // The other end must be north of the M1 plaza for the job to cross it.
    if (!(other.lat > M1_TOLL_PLAZA_LAT + 0.04)) return NONE;
    dublinEnd = pickupDublin ? "pickup" : "dropoff";
    zone = dublinTollZone(pickupDublin ? input.pickup : input.dropoff);
  } else {
    const pickupDublin = isDublinText(pickupLabel);
    const dropoffDublin = isDublinText(dropoffLabel);
    if (pickupDublin === dropoffDublin) return NONE;
    dublinEnd = pickupDublin ? "pickup" : "dropoff";
    zone = "north"; // Zone unknown without coordinates: M1 only.
  }

  const duration = Number.isFinite(input.durationMinutes) && (input.durationMinutes ?? 0) > 0
    ? Math.round(input.durationMinutes as number)
    : 120;

  const legFor = (leg: "outbound" | "return", date?: string, time?: string): DublinTollLeg => {
    // Outbound leg runs pickup → drop-off; the return leg runs the other way.
    const intoDublin = leg === "outbound" ? dublinEnd === "dropoff" : dublinEnd === "pickup";
    const start = minutesOf(time);
    let tunnelEur = 0;
    if (zone === "tunnel") {
      if (intoDublin) {
        // Customer southbound on arrival; driver northbound empty straight after.
        const arrive = start == null ? null : start + duration;
        tunnelEur =
          portTunnelCrossingEur("southbound", date, arrive) +
          portTunnelCrossingEur("northbound", date, arrive == null ? null : arrive + 15);
      } else {
        // Driver southbound empty before the pickup; customer northbound after it.
        tunnelEur =
          portTunnelCrossingEur("southbound", date, start == null ? null : start - 15) +
          portTunnelCrossingEur("northbound", date, start == null ? null : start + 10);
      }
    }
    const m50Eur = zone === "m50" ? 2 * m50CrossingEur(date) : 0;
    const portTunnelGbp = Math.round(tunnelEur * DUBLIN_TOLL_EUR_TO_GBP);
    const m50Gbp = Math.round(m50Eur * DUBLIN_TOLL_EUR_TO_GBP);
    const m1Gbp = DUBLIN_M1_TOLL_ALLOWANCE_GBP;
    return { leg, zone, m1Gbp, portTunnelGbp, m50Gbp, totalGbp: m1Gbp + portTunnelGbp + m50Gbp };
  };

  const legs = [legFor("outbound", input.outboundDate, input.outboundTime)];
  if (input.returnJourney) legs.push(legFor("return", input.returnDate, input.returnTime));
  return {
    outboundGbp: legs[0]!.totalGbp,
    returnGbp: legs[1]?.totalGbp ?? 0,
    legs,
  };
}
