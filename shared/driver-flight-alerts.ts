/**
 * Driver flight-delay alert dedupe helpers (pure — no secrets).
 * Alerts fire on: first delay, ETA change ≥15 min, delay increase ≥15 min, landed, cancelled.
 */

export type DriverFlightAlertSnapshot = {
  flightNumber: string;
  statusCategory: string;
  statusLabel?: string;
  estimatedTime?: string;
  actualTime?: string;
  delayMinutes?: number | null;
  notifiedAt: string;
};

export type DriverFlightAlertKind =
  | "delayed"
  | "eta_change"
  | "delay_increase"
  | "landed"
  | "cancelled";

export type DriverFlightAlertDecision =
  | { send: false }
  | {
      send: true;
      kind: DriverFlightAlertKind;
      subject: string;
      body: string;
      nextSnapshot: DriverFlightAlertSnapshot;
    };

const ETA_CHANGE_MINUTES = 15;
const DELAY_INCREASE_MINUTES = 15;

function parseHmToMinutes(hm?: string | null): number | null {
  const m = (hm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function etaChangedMaterially(prev?: string, next?: string): boolean {
  const a = parseHmToMinutes(prev);
  const b = parseHmToMinutes(next);
  if (a == null || b == null) {
    return Boolean(prev && next && prev !== next);
  }
  let delta = Math.abs(b - a);
  if (delta > 12 * 60) delta = 24 * 60 - delta;
  return delta >= ETA_CHANGE_MINUTES;
}

export function decideDriverFlightAlert(input: {
  flightNumber: string;
  statusCategory?: string | null;
  statusLabel?: string | null;
  estimatedTime?: string | null;
  actualTime?: string | null;
  delayMinutes?: number | null;
  previous: DriverFlightAlertSnapshot | null;
  nowIso?: string;
}): DriverFlightAlertDecision {
  const flightNumber = input.flightNumber.trim() || "Flight";
  const category = (input.statusCategory || "unknown").trim();
  const delay =
    typeof input.delayMinutes === "number" && Number.isFinite(input.delayMinutes)
      ? input.delayMinutes
      : null;
  const nowIso = input.nowIso || new Date().toISOString();
  const nextSnapshot: DriverFlightAlertSnapshot = {
    flightNumber,
    statusCategory: category,
    statusLabel: input.statusLabel || undefined,
    estimatedTime: input.estimatedTime || undefined,
    actualTime: input.actualTime || undefined,
    delayMinutes: delay,
    notifiedAt: nowIso,
  };

  const prev = input.previous;

  if (category === "cancelled") {
    if (prev?.statusCategory === "cancelled") return { send: false };
    return {
      send: true,
      kind: "cancelled",
      subject: `Flight ${flightNumber} cancelled`,
      body: `Flight ${flightNumber} has been cancelled.\n\nContact the customer and replan the collection.`,
      nextSnapshot,
    };
  }

  if (category === "landed") {
    if (prev?.statusCategory === "landed") return { send: false };
    return {
      send: true,
      kind: "landed",
      subject: `Flight ${flightNumber} has landed`,
      body: `Flight ${flightNumber} has landed.\n\nActual arrival: ${input.actualTime || "—"}${
        delay != null && delay > 0 ? `\nDelay: ${delay} minutes` : ""
      }`,
      nextSnapshot,
    };
  }

  if (category === "delayed" && delay != null && delay >= 5) {
    if (!prev || prev.statusCategory !== "delayed") {
      return {
        send: true,
        kind: "delayed",
        subject: `Flight ${flightNumber} delayed`,
        body: `Flight ${flightNumber} delayed\n\nNew ETA: ${input.estimatedTime || "—"}\nDelay: ${delay} minutes`,
        nextSnapshot,
      };
    }
    const prevDelay = typeof prev.delayMinutes === "number" ? prev.delayMinutes : 0;
    if (delay - prevDelay >= DELAY_INCREASE_MINUTES) {
      return {
        send: true,
        kind: "delay_increase",
        subject: `Flight ${flightNumber} delay increased`,
        body: `Flight ${flightNumber} delayed\n\nNew ETA: ${input.estimatedTime || "—"}\nDelay: ${delay} minutes (was ${prevDelay} min)`,
        nextSnapshot,
      };
    }
    if (etaChangedMaterially(prev.estimatedTime, input.estimatedTime || undefined)) {
      return {
        send: true,
        kind: "eta_change",
        subject: `Flight ${flightNumber} ETA changed`,
        body: `Flight ${flightNumber} delayed\n\nNew ETA: ${input.estimatedTime || "—"}\nDelay: ${delay} minutes`,
        nextSnapshot,
      };
    }
    return { send: false };
  }

  return { send: false };
}

export function driverFlightAlertKvKey(
  paymentReference: string,
  isReturnLeg: boolean,
): string {
  const ref = paymentReference.trim().toUpperCase();
  return `flight-alert:${ref}:${isReturnLeg ? "return" : "outbound"}`;
}
