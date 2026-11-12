/**
 * Stage 2 driver jobs — browser client (owner dashboard + driver portal).
 * The Worker only serves these routes where a DRIVER_DB binding exists (isolated staging).
 */
import { DRIVER_ACCOUNT_SESSION_HEADER, request } from "@/lib/driver-accounts-api";

export type Leg = "outbound" | "return";
export type OfferMode = "fixed" | "bids" | "direct";
export type JobStatus = "confirmed" | "on_the_way" | "arrived" | "completed" | "released" | "booking_cancelled";
export type LegValues = { tripDate: string; tripTime: string; pickup: string; dropoff: string };
export type JobChange = { id: string; status: "pending" | "cant_do" | "accepted" | "superseded"; from: LegValues; to: LegValues; createdAt: string; respondedAt: string | null };

// ---------- owner ----------

export type NeedsDriver = {
  reference: string; leg: Leg; tripDate: string; tripTime: string; pickup: string; dropoff: string;
  passengers: number; vehicle: string; customerFirstName: string; assignedOutsidePortal: boolean;
};
export type OfferRecipient = {
  driverId: string; driverName: string; driverStatus: string; state: "sent" | "accepted" | "declined" | "bid";
  bidPence: number | null; bidLabel: string; bidNote: string; seenAt: string | null; respondedAt: string | null; canBeChosen: boolean;
};
export type OwnerOffer = {
  id: string; reference: string; leg: Leg; mode: OfferMode; feePence: number | null; feeLabel: string;
  tripDate: string; tripTime: string; pickup: string; dropoff: string; note: string; status: string;
  expiresAt: string; createdAt: string; closedAt: string | null; recipients: OfferRecipient[];
};
export type LocationRecord = { verified: true; at: string; lat: number; lng: number; accuracyMetres: number | null } | { verified: false; at: string; note: string };
export type OwnerJob = {
  id: string; reference: string; leg: Leg; driverId: string; driverName: string; driverStatus: string; driverMobile: string;
  feePence: number; feeLabel: string; tripDate: string; tripTime: string; pickup: string; dropoff: string; status: JobStatus;
  onTheWayAt: string | null; arrivedAt: string | null; completedAt: string | null;
  arrivedLocation: LocationRecord | null; completedLocation: LocationRecord | null;
  releasedAt: string | null; releaseReason: string; customerToldAt: string | null; change: JobChange | null; payment: string;
};
export type DispatchDriver = { id: string; name: string; available: boolean; documentsOk: boolean; canReceiveOffers: boolean; hasVehicleReg: boolean };
export type Escalation = {
  id: string; sourceType: "message" | "change" | "offer" | "job"; sourceId: string; driverId: string | null; driverName: string;
  priority: "high" | "normal"; title: string; body: string; createdAt: string; reminders: number; acknowledgedAt: string | null; nextReminderAt: string | null;
};
export type DispatchBoard = {
  today: string; bookingLookupFailed: boolean; needsDriver: NeedsDriver[]; offers: OwnerOffer[]; closedOffers: OwnerOffer[];
  jobs: OwnerJob[]; recent: OwnerJob[]; drivers: DispatchDriver[]; escalations: Escalation[];
};
export type DispatchSummary = { escalations: Escalation[]; unacknowledged: number; openOffers: number; bids: number; liveJobs: number };

const owner = (ownerKey: string) => ({ "X-Owner-Key": ownerKey.trim() });

export const ownerJobs = {
  board: (key: string) => request<DispatchBoard>("/owner/driver-jobs", { headers: owner(key) }),
  summary: (key: string) => request<DispatchSummary>("/owner/driver-jobs/summary", { headers: owner(key) }),
  createOffer: (key: string, body: { reference: string; leg: Leg; mode: OfferMode; feePence?: number; driverIds: string[]; expiresInMinutes: number; note: string }) =>
    request<{ offerId: string; sentTo: { driverId: string; name: string }[]; refused: { driverId: string; name: string; reason: string }[]; expiresAt: string }>(
      "/owner/driver-jobs/offers",
      { headers: owner(key), body },
    ),
  withdrawOffer: (key: string, offerId: string) => request<{ ok: true }>("/owner/driver-jobs/offers/withdraw", { headers: owner(key), body: { offerId } }),
  award: (key: string, offerId: string, driverId: string) =>
    request<{ jobId: string; feeLabel: string }>("/owner/driver-jobs/offers/award", { headers: owner(key), body: { offerId, driverId } }),
  release: (key: string, jobId: string, reason: string) =>
    request<{ customerTold: false; bookingChanged: false }>("/owner/driver-jobs/jobs/release", { headers: owner(key), body: { jobId, reason } }),
  acknowledge: (key: string, id: string) => request<{ stillOpen: boolean }>("/owner/driver-jobs/escalations/ack", { headers: owner(key), body: { id } }),
  closeAlert: (key: string, id: string, note: string) => request<{ ok: true }>("/owner/driver-jobs/escalations/close", { headers: owner(key), body: { id, note } }),
};

// ---------- driver ----------

export type DriverOffer = {
  id: string; mode: OfferMode; feePence: number | null; feeLabel: string; tripDate: string; tripTime: string; leg: Leg;
  pickupArea: string; dropoffArea: string; passengers: number; suitcases: number; vehicle: string; hasFlight: boolean; note: string;
  expiresAt: string; myState: "sent" | "bid"; myBidPence: number | null; myBidLabel: string; myBidNote: string;
};
export type DriverJob = {
  id: string; reference: string; leg: Leg; tripDate: string; tripTime: string; pickup: string; dropoff: string;
  feePence: number; feeLabel: string; status: JobStatus; onTheWayAt: string | null; arrivedAt: string | null; completedAt: string | null;
  passengers: number | null; suitcases: number | null; vehicle: string; flightNumber: string;
  customerFirstName: string; customerMobile: string; notes: string; change: JobChange | null; nextStatus: "on_the_way" | "arrived" | "completed";
};
export type DriverPastJob = {
  id: string; leg: Leg; tripDate: string; tripTime: string; pickup: string; dropoff: string; feePence: number; feeLabel: string;
  status: JobStatus; completedAt: string | null; note: string;
};
export type DriverJobsView = { today: string; vehicleReg: string; available: boolean; offers: DriverOffer[]; jobs: DriverJob[]; past: DriverPastJob[] };

const driver = (session: string) => ({ [DRIVER_ACCOUNT_SESSION_HEADER]: session });

export const driverJobs = {
  list: (session: string) => request<DriverJobsView>("/driver-portal/jobs", { headers: driver(session) }),
  setVehicleReg: (session: string, vehicleReg: string) => request<{ vehicleReg: string }>("/driver-portal/jobs/vehicle", { headers: driver(session), body: { vehicleReg } }),
  respond: (session: string, offerId: string, action: "accept" | "decline" | "bid", bidPence?: number, note?: string) =>
    request<{ state: string }>("/driver-portal/jobs/offer-response", { headers: driver(session), body: { offerId, action, bidPence, note } }),
  setStatus: (session: string, jobId: string, status: string, location: { lat: number; lng: number; accuracy: number } | null) =>
    request<{ status: JobStatus; locationVerified: boolean | null }>("/driver-portal/jobs/status", { headers: driver(session), body: { jobId, status, location } }),
  answerChange: (session: string, changeId: string, action: "accept" | "cant_do") =>
    request<{ status: string }>("/driver-portal/jobs/change-response", { headers: driver(session), body: { changeId, action } }),
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  confirmed: "Confirmed",
  on_the_way: "On the way",
  arrived: "Arrived",
  completed: "Completed",
  released: "Removed by office",
  booking_cancelled: "Booking cancelled",
};

export const NEXT_STATUS_LABEL: Record<string, string> = { on_the_way: "On the way", arrived: "Arrived", completed: "Complete job" };

export const OFFER_MODE_LABEL: Record<OfferMode, string> = { fixed: "Fixed price", bids: "Drivers bid", direct: "Direct to one driver" };

/** "45" or "45.50" → 4500 / 4550 pence; null if not a sensible amount. */
export function poundsToPence(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence >= 100 && pence <= 200_000 ? pence : null;
}

/** Best-effort phone location for Arrived / Complete. Resolves null if refused, unavailable or slow. */
export function readLocation(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = window.setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
