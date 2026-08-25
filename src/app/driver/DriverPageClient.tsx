"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import OwnerBookingJobsPanel from "@/components/OwnerBookingJobsPanel";
import OwnerPaidBookingsPanel from "@/components/OwnerPaidBookingsPanel";
import OwnerAmendmentTestPanel from "@/components/OwnerAmendmentTestPanel";
import OwnerShortNoticePanel from "@/components/OwnerShortNoticePanel";
import OwnerPersonalQuotesPanel from "@/components/OwnerPersonalQuotesPanel";
import OwnerBookingCalendar from "@/components/OwnerBookingCalendar";
import OwnerAccountProfilePanel from "@/components/OwnerAccountProfilePanel";
import OwnerAssignDriverPanel from "@/components/OwnerAssignDriverPanel";
import OwnerFinancialSummaryPanel from "@/components/OwnerFinancialSummaryPanel";
import OwnerDashboardToolSwitcher, {
  type OwnerDashboardToolTab,
} from "@/components/OwnerDashboardToolSwitcher";
import type { MapMarker, MapRoutePoint } from "@/components/LiveTrackMap";
import {
  buildWhatsAppDriverDetailsLink,
  fetchDriverJobs,
  postDriverLocation,
  setDriverSharing,
  postJourneyAction,
  fetchJourneyEvidence,
  JOURNEY_ACTION_LABELS,
  updateDriverBooking,
  verifyDriverAccessKey,
  fetchDriverStatus,
  deassignJob,
  respondToJobAssignment,
  fetchDriverRoster,
  fetchDriverLocationHistory,
  fetchDriverVehicleProfiles,
  fetchDriverVehicle,
  fetchOwnerAccountProfile,
  saveDriverVehicle,
  sendDriverPayment,
  type DriverJob,
  type JourneyAction,
  type JourneyEvidencePack,
} from "@/lib/tracking-api";
import { issueBookingRefund, markBookingRefundedExternally } from "@/lib/refund-api";
import { canMarkExternalRefund, isOperationallyCancelled } from "../../../shared/refund-ops";
import { formatDriverPayAmount } from "../../../shared/tracking";
import { formatPassengerSuitcaseCounts } from "@/lib/party-size";
import {
  ownerPrimaryJourneyConfirmCopy,
  type OwnerPrimaryJourneyAction,
} from "../../../shared/upcoming-jobs";
import { DEMO_DRIVER_KEY, DEMO_DRIVER_NAME, DEMO_OWNER_KEY, DEMO_ROSTER } from "@/lib/tracking-demo";
import { SERVICE_FLAGS, SITE } from "@/lib/data";
import {
  buildArrivedPickupWhatsAppLink,
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppLink,
  isAirportPickupLabel,
} from "../../../shared/arrival-whatsapp";

/** Mirror of shared DRIVER_GPS_STALE_MS — warn when browser GPS stops updating. */
const DRIVER_GPS_STALE_MS = 2 * 60 * 1000;

function readDemoQueryParam(): "owner" | "driver" | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("demo")?.trim().toLowerCase();
  if (value === "owner" || value === "driver") {
    return value;
  }

  return null;
}

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-white/[0.03] text-white/60 sm:h-80">
      Loading map…
    </div>
  ),
});

const DRIVER_KEY_STORAGE = "matni-driver-key";
const OWNER_KEY_STORAGE = "matni-owner-key";

function portalKeyStorage(portal: "owner" | "driver"): string {
  return portal === "owner" ? OWNER_KEY_STORAGE : DRIVER_KEY_STORAGE;
}

type DashboardView = "today" | "upcoming" | "date";

const DRIVER_JOURNEY_STEPS = [
  {
    action: "start_tracking",
    label: "Driver on way",
    completedLabel: "On the way ✓",
  },
  {
    action: "arrived_pickup",
    label: "Driver arrived",
    completedLabel: "Arrived ✓",
  },
  {
    action: "complete_journey",
    label: "Complete journey",
    completedLabel: "Completed ✓",
  },
] as const satisfies ReadonlyArray<{
  action: OwnerPrimaryJourneyAction;
  label: string;
  completedLabel: string;
}>;

/** Keep active Driver journey controls visually identical to the Owner controls. */
function primaryJourneyButtonClass(action: OwnerPrimaryJourneyAction): string {
  const base =
    "min-h-14 w-full rounded-xl px-4 py-3.5 text-base font-bold transition-colors disabled:opacity-60";
  switch (action) {
    case "start_tracking":
      return `${base} bg-sky-400 text-navy hover:bg-sky-300`;
    case "arrived_pickup":
      return `${base} bg-amber-300 text-navy hover:bg-amber-200`;
    case "complete_journey":
      return `${base} bg-emerald text-navy hover:bg-emerald/90`;
  }
}

function todayLondonDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftLondonDate(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDateHeading(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function groupJobsByDate(jobs: DriverJob[]): Array<{ date: string; jobs: DriverJob[] }> {
  const groups = new Map<string, DriverJob[]>();

  for (const job of jobs) {
    const existing = groups.get(job.tripDate) ?? [];
    existing.push(job);
    groups.set(job.tripDate, existing);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedJobs]) => ({
      date,
      jobs: groupedJobs.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)),
    }));
}

function isOwnerCompletedDriverJob(job: DriverJob): boolean {
  return (
    job.bookingStatus === "refunded" ||
    job.bookingStatus === "cancelled" ||
    (job.journeyStatus ?? "") === "completed"
  );
}

function groupOwnerJobsByDateWithCompleted(
  jobs: DriverJob[],
): Array<{ date: string; upcoming: DriverJob[]; completed: DriverJob[] }> {
  const groups = new Map<string, { upcoming: DriverJob[]; completed: DriverJob[] }>();

  for (const job of jobs) {
    const date = job.tripDate || "unknown";
    const bucket = groups.get(date) ?? { upcoming: [], completed: [] };
    if (isOwnerCompletedDriverJob(job)) {
      bucket.completed.push(job);
    } else {
      bucket.upcoming.push(job);
    }
    groups.set(date, bucket);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => ({
      date,
      upcoming: bucket.upcoming.slice().sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)),
      completed: bucket.completed.slice().sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)),
    }));
}

function jobMapMarkers(
  job: DriverJob,
  options: { isActiveDriver: boolean; isOwner: boolean },
): MapMarker[] {
  const markers: MapMarker[] = [];

  if (job.driver) {
    if (options.isActiveDriver) {
      markers.push({
        lat: job.driver.lat,
        lng: job.driver.lng,
        label: "You (driver)",
      });
    } else if (options.isOwner) {
      markers.push({
        lat: job.driver.lat,
        lng: job.driver.lng,
        label: `${job.activeDriverName ?? "Driver"} (driver)`,
      });
    }
  }

  if (job.customer) {
    markers.push({
      lat: job.customer.lat,
      lng: job.customer.lng,
      label: `${job.customerName} (customer)`,
    });
  }

  return markers;
}

function flightStatusClass(status?: string): string {
  const normalised = status?.toLowerCase() ?? "";
  if (normalised.includes("land") || normalised.includes("arriv")) {
    return "bg-emerald/15 text-emerald";
  }
  if (normalised.includes("delay") || normalised.includes("late")) {
    return "bg-amber-500/15 text-amber-200";
  }
  if (normalised.includes("cancel")) {
    return "bg-red-500/15 text-red-200";
  }
  return "bg-white/10 text-white/70";
}

function DriverFlightPanel({
  job,
  onRefresh,
  refreshing,
}: {
  job: DriverJob;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (!job.isAirportPickup) {
    return null;
  }

  if (!job.flightNumber) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 px-4 py-3 text-sm text-white/60">
        Airport pickup — no flight number was provided for this booking.
      </div>
    );
  }

  if (!job.flight) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Incoming flight</p>
            <p className="mt-1 text-lg font-bold text-white">{job.flightNumber}</p>
            <p className="mt-1 text-sm text-white/60">
              Live flight status is not available right now. Check the airport arrivals board before
              pickup.
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={onRefresh}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              {refreshing ? "Refreshing…" : "Refresh flight"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const { flight } = job;

  return (
    <div className="mt-4 rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Incoming flight</p>
          <p className="mt-1 text-lg font-bold text-white">
            {flight.flightNumber} · {flight.airline}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {flight.departureAirport} → {flight.arrivalAirport}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {flight.status && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${flightStatusClass(flight.status)}`}
            >
              {flight.status}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={onRefresh}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              {refreshing ? "Refreshing…" : "Refresh flight"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-white/80">
        Scheduled arrival:{" "}
        <span className="font-semibold text-white">{flight.scheduledTimeLabel}</span>
        {" · "}
        {flight.airportName} ({flight.airportCode})
      </p>
      <p className="mt-2 text-xs text-white/50">
        60 minutes complimentary waiting applies from actual landing time.
      </p>
    </div>
  );
}

function assignmentSummary(job: DriverJob): string {
  switch (job.assignmentStatus ?? "unassigned") {
    case "pending":
      return `Awaiting ${job.assignedDriverName ?? "driver"} to accept`;
    case "accepted":
      return `Assigned to ${job.assignedDriverName ?? "driver"}`;
    case "declined":
      return `${job.assignedDriverName ?? "Driver"} declined`;
    default:
      return "Unassigned";
  }
}

function assignmentBadgeClass(status: DriverJob["assignmentStatus"]): string {
  switch (status ?? "unassigned") {
    case "pending":
      return "bg-amber-500/15 text-amber-200";
    case "accepted":
      return "bg-emerald/15 text-emerald";
    case "declined":
      return "bg-red-500/15 text-red-200";
    default:
      return "bg-white/10 text-white/50";
  }
}

function DriverProfilePanel({
  accessKey,
  isOwner,
  driverName,
  defaultCollapsed = false,
}: {
  accessKey: string;
  isOwner: boolean;
  driverName: string | null;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [profiles, setProfiles] = useState<
    Array<{ profileKey: string; displayName: string; complete?: boolean }>
  >([]);
  const [selectedProfile, setSelectedProfile] = useState(
    isOwner ? "owner" : (driverName ?? "").trim().toLowerCase().replace(/\s+/g, "-"),
  );
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    mobile: "",
    make: "",
    model: "",
    colour: "",
    registration: "",
  });
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetchDriverVehicleProfiles(accessKey)
      .then((nextProfiles) => {
        if (cancelled) {
          return;
        }

        // Owner account profile is the default journey driver — do not show the
        // "owner" slot here (avoids duplicate data entry). Additional drivers only.
        const visible = isOwner
          ? nextProfiles.filter((entry) => entry.profileKey !== "owner")
          : nextProfiles;

        setProfiles(visible);
        setSelectedProfile((current) => {
          if (
            current &&
            visible.some(
              (entry) =>
                entry.profileKey === current && (!isOwner || entry.complete),
            )
          ) {
            return current;
          }
          if (!isOwner && driverName) {
            const key = driverName.trim().toLowerCase().replace(/\s+/g, "-");
            if (visible.some((entry) => entry.profileKey === key)) {
              return key;
            }
          }
          // Owner: never auto-open an incomplete roster stub (that caused duplicate forms).
          if (isOwner) {
            return visible.find((entry) => entry.complete)?.profileKey ?? "";
          }
          return visible[0]?.profileKey ?? "";
        });
        if (visible.length === 0 || (isOwner && !visible.some((entry) => entry.complete))) {
          setLoading(false);
          setProfileComplete(true);
          setCollapsed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load vehicle profiles.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, driverName, isOwner]);

  useEffect(() => {
    if (!selectedProfile) {
      if (isOwner) {
        setLoading(false);
        setProfileComplete(true);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    void fetchDriverVehicle(accessKey, selectedProfile)
      .then((profile) => {
        if (cancelled) {
          return;
        }

        const fallbackName =
          selectedProfile === "owner"
            ? "Owner"
            : profiles.find((entry) => entry.profileKey === selectedProfile)?.displayName ??
              selectedProfile;

        if (profile) {
          setForm({
            displayName: profile.displayName || fallbackName,
            email: profile.email ?? "",
            mobile: profile.mobile ?? "",
            make: profile.make ?? "",
            model: profile.model ?? "",
            colour: profile.colour ?? "",
            registration: profile.registration ?? "",
          });
          const complete = Boolean(
            profile.displayName?.trim() &&
              profile.email?.trim() &&
              profile.make?.trim() &&
              profile.model?.trim() &&
              profile.colour?.trim() &&
              profile.registration?.trim(),
          );
          setProfileComplete(complete);
          setSavedAt(profile.updatedAt ?? null);
          if (complete) {
            setCollapsed(true);
          }
        } else {
          setForm({
            displayName: fallbackName,
            email: "",
            mobile: "",
            make: "",
            model: "",
            colour: "",
            registration: "",
          });
          setProfileComplete(false);
          setSavedAt(null);
          setCollapsed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load saved vehicle details.");
          setProfileComplete(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, selectedProfile, profiles, isOwner]);

  const saveProfile = async () => {
    if (!selectedProfile?.trim() && !(addingNew && form.displayName.trim())) {
      setError(
        isOwner
          ? "Add a driver name before saving. Your Owner profile is already the default."
          : "Missing driver profile key.",
      );
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const profileKeyForSave = addingNew
        ? form.displayName.trim()
        : selectedProfile.trim() || form.displayName.trim();

      const result = await saveDriverVehicle(accessKey, {
        profile: profileKeyForSave,
        displayName: form.displayName,
        email: form.email,
        mobile: form.mobile,
        make: form.make,
        model: form.model,
        colour: form.colour,
        registration: form.registration,
      });

      if (!result.profile?.profileKey) {
        throw new Error("Save did not return a stored driver profile");
      }

      setForm({
        displayName: result.profile.displayName,
        email: result.profile.email,
        mobile: result.profile.mobile ?? "",
        make: result.profile.make,
        model: result.profile.model,
        colour: result.profile.colour,
        registration: result.profile.registration,
      });
      setSelectedProfile(result.profile.profileKey);
      setAddingNew(false);
      setProfileComplete(true);
      setSavedAt(result.profile.updatedAt ?? new Date().toISOString());
      setCollapsed(true);
      setProfiles((current) => {
        const next = current.filter((entry) => entry.profileKey !== result.profile.profileKey);
        next.unshift({
          profileKey: result.profile.profileKey,
          displayName: result.profile.displayName,
          complete: true,
        });
        return next;
      });

      setMessage(
        result.emailSent
          ? `Saved. Confirmation emailed to ${result.profile.email}.`
          : result.emailWarning
            ? `Saved on the server, but the confirmation email could not be sent: ${result.emailWarning}`
            : "Saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save driver profile");
      setProfileComplete(false);
    } finally {
      setSaving(false);
    }
  };

  const showSetupPrompt = !loading && !profileComplete && Boolean(selectedProfile || addingNew);
  // Owner managing additional drivers can collapse when complete — do not force the editor open.
  // When there are no additional drivers, keep the default-driver notice visible (no empty form).
  const ownerUsingDefaultDriver = isOwner && !selectedProfile && !addingNew;
  const incompleteAdditional = isOwner
    ? profiles.filter((entry) => !entry.complete)
    : [];
  const completeAdditional = isOwner
    ? profiles.filter((entry) => entry.complete)
    : [];
  const showEditor =
    ((!ownerUsingDefaultDriver && (!collapsed || showSetupPrompt)) || addingNew);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white">
            {isOwner ? "Additional drivers (optional)" : "Your driver profile"}
          </h2>
          <p className="mt-2 text-sm text-white/60">
            {isOwner
              ? "Your Owner profile above is the default driver for journeys and customer tracking. Add another driver here only if someone else will drive a job."
              : "Save your name, email, mobile, and vehicle details. They are stored on the server and restored on your next login."}
          </p>
          {isOwner && ownerUsingDefaultDriver && !loading ? (
            <p className="mt-3 text-sm text-emerald">
              Using Owner profile as the default driver. No separate driver entry needed.
            </p>
          ) : null}
          {isOwner && completeAdditional.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {completeAdditional.map((profile) => (
                <button
                  key={profile.profileKey}
                  type="button"
                  onClick={() => {
                    setAddingNew(false);
                    setSelectedProfile(profile.profileKey);
                    setCollapsed(false);
                    setProfileComplete(true);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    selectedProfile === profile.profileKey
                      ? "border-emerald bg-emerald/20 text-white"
                      : "border-white/15 text-white/80 hover:border-white/30"
                  }`}
                >
                  <span className="block text-sm font-bold">{profile.displayName}</span>
                  <span className="text-white/50">Saved driver</span>
                </button>
              ))}
            </div>
          ) : null}
          {isOwner && ownerUsingDefaultDriver && incompleteAdditional.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {incompleteAdditional.map((profile) => (
                <button
                  key={profile.profileKey}
                  type="button"
                  onClick={() => {
                    setAddingNew(false);
                    setSelectedProfile(profile.profileKey);
                    setCollapsed(false);
                    setProfileComplete(false);
                  }}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:border-white/30"
                >
                  Set up {profile.displayName}
                </button>
              ))}
            </div>
          ) : null}
          {profileComplete && collapsed && selectedProfile ? (
            <p className="mt-3 text-sm text-emerald">
              Saved · {form.displayName} · {form.make} {form.model} ({form.colour}) ·{" "}
              {form.registration}
            </p>
          ) : null}
          {showSetupPrompt ? (
            <p className="mt-3 text-sm text-amber-100">
              {isOwner
                ? "This additional driver’s details are not saved yet — enter the fields below and press Save."
                : "Driver details are not saved yet — enter the fields below and press Save."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setAddingNew(true);
                setSelectedProfile("");
                setCollapsed(false);
                setProfileComplete(false);
                setForm({
                  displayName: "",
                  email: "",
                  mobile: "",
                  make: "",
                  model: "",
                  colour: "",
                  registration: "",
                });
                setMessage(null);
                setError(null);
              }}
              className="rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2 text-sm font-semibold text-emerald transition-colors hover:bg-emerald/25"
            >
              Add saved driver
            </button>
          ) : null}
          {isOwner && (selectedProfile || addingNew) ? (
            <button
              type="button"
              onClick={() => {
                setSelectedProfile("");
                setAddingNew(false);
                setCollapsed(true);
                setProfileComplete(true);
                setMessage(null);
                setError(null);
              }}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Use Owner profile
            </button>
          ) : null}
          {profileComplete && selectedProfile ? (
            <span className="rounded-full border border-emerald/40 bg-emerald/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald">
              Saved
            </span>
          ) : null}
          {!showSetupPrompt && selectedProfile ? (
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              {collapsed ? "Edit profile" : "Collapse"}
            </button>
          ) : null}
          {isOwner && profiles.filter((entry) => entry.complete).length > 1 ? (
            <select
              value={selectedProfile}
              onChange={(event) => setSelectedProfile(event.target.value)}
              className="rounded-xl border border-white/15 bg-navy px-4 py-2.5 text-sm text-white outline-none focus:border-emerald"
            >
              {profiles
                .filter((entry) => entry.complete)
                .map((profile) => (
                  <option key={profile.profileKey} value={profile.profileKey}>
                    {profile.displayName} ✓
                  </option>
                ))}
            </select>
          ) : null}
        </div>
      </div>

      {showEditor && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-white/70">
              Name
              <input
                type="text"
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="e.g. Driver name"
              />
            </label>
            <label className="block text-sm text-white/70">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="driver@example.com"
              />
            </label>
            <label className="block text-sm text-white/70">
              Mobile
              <input
                type="tel"
                value={form.mobile}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mobile: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="e.g. 07700 900123"
              />
            </label>
            <label className="block text-sm text-white/70">
              Make
              <input
                type="text"
                value={form.make}
                onChange={(event) => setForm((current) => ({ ...current, make: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="e.g. Mercedes-Benz"
              />
            </label>
            <label className="block text-sm text-white/70">
              Model
              <input
                type="text"
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({ ...current, model: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="e.g. E-Class"
              />
            </label>
            <label className="block text-sm text-white/70">
              Colour
              <input
                type="text"
                value={form.colour}
                onChange={(event) =>
                  setForm((current) => ({ ...current, colour: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="e.g. Black"
              />
            </label>
            <label className="block text-sm text-white/70">
              Registration
              <input
                type="text"
                value={form.registration}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    registration: event.target.value.toUpperCase(),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 uppercase text-white outline-none focus:border-emerald"
                placeholder="e.g. ABC 1234"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void saveProfile()}
              className="rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : profileComplete ? "Update saved profile" : "Save profile"}
            </button>
          </div>

          {message && (
            <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
              {message}
              {savedAt ? ` · Updated ${new Date(savedAt).toLocaleString("en-GB")}` : ""}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function DriverJobCard({
  job,
  driverKey,
  activeToken,
  onSharingChange,
  onSessionChange,
  onRefunded,
  onUpdated,
  onAssignmentUpdated,
  onRefreshJob,
  refreshingJob = false,
  compactTracking = false,
  highlightPending = false,
  isOwner = false,
  availableDrivers = [],
  gpsStale = false,
  lastGpsAt = null,
}: {
  job: DriverJob;
  driverKey: string;
  activeToken: string | null;
  onSharingChange: (token: string | null) => void;
  onSessionChange: (token: string, sessionToken: string | null) => void;
  onRefunded: (token: string, refundAmount?: string) => void;
  onUpdated: (job: DriverJob) => void;
  onAssignmentUpdated: (job: DriverJob) => void;
  onRefreshJob?: () => void;
  refreshingJob?: boolean;
  compactTracking?: boolean;
  highlightPending?: boolean;
  isOwner?: boolean;
  availableDrivers?: string[];
  gpsStale?: boolean;
  lastGpsAt?: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundConfirmKey, setRefundConfirmKey] = useState("");
  const [refundFinalConfirm, setRefundFinalConfirm] = useState(false);
  const [externalRefundConfirmOpen, setExternalRefundConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidence, setEvidence] = useState<JourneyEvidencePack | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    customerMobile: job.customerMobile,
    flightNumber: job.flightNumber ?? "",
  });
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignFormOpen, setAssignFormOpen] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({
    driverFirstName: "",
    driverEmail: "",
    driverMobile: "",
    driverCarMake: "",
    driverCarModel: "",
    driverCarColour: "",
    driverReg: "",
    driverPayAmount: "",
  });
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(
    job.driverPaymentAmount ?? job.driverPayAmount ?? "",
  );
  const [journeyConfirmAction, setJourneyConfirmAction] =
    useState<OwnerPrimaryJourneyAction | null>(null);
  const journeyActionInFlightRef = useRef(false);
  const [recordedRoute, setRecordedRoute] = useState<MapRoutePoint[]>([]);
  const isActive = activeToken === job.token;
  const mapMarkers = jobMapMarkers(job, { isActiveDriver: isActive, isOwner });
  const isDemoKey = driverKey === DEMO_DRIVER_KEY || driverKey === DEMO_OWNER_KEY;
  const isRefunded = isOperationallyCancelled(job.bookingStatus);
  const assignmentStatus = job.assignmentStatus ?? "unassigned";
  const paidFromLabel = Number(String(job.amountPaidLabel ?? "").replace(/[^\d.]/g, "")) || 0;
  const canMarkExternal =
    isOwner &&
    Boolean(job.paymentReference?.trim()) &&
    !isDemoKey &&
    canMarkExternalRefund({
      status: job.bookingStatus,
      amountPaid: paidFromLabel > 0 ? paidFromLabel : 1,
      amountRefunded: isRefunded && job.bookingStatus === "refunded" ? paidFromLabel || 1 : 0,
    });
  const isPendingForDriver = !isOwner && assignmentStatus === "pending";
  const isAcceptedAssignment = assignmentStatus === "accepted";
  const isAssigned =
    assignmentStatus === "pending" || assignmentStatus === "accepted" || assignmentStatus === "declined";
  const canIssueRefund =
    isOwner && Boolean(job.paymentReference?.trim()) && !isRefunded;
  const canRefund = canIssueRefund && !isDemoKey;
  const showDemoRefund = canIssueRefund && isDemoKey;
  const canEdit = !isRefunded && isOwner;
  const canShare =
    isOwner &&
    !isRefunded &&
    !compactTracking &&
    (job.trackingWindow.open || job.sharingActive);
  const trackingAvailable = !compactTracking && job.trackingWindow.open && !isRefunded;
  const driverSharingLive = Boolean(job.sharingActive && job.driver);
  const showRecordedRoute = isOwner && (job.driverLocationPointCount ?? 0) > 0;
  const showMap =
    isOwner && (mapMarkers.length > 0 || (showRecordedRoute && recordedRoute.length > 0));
  const journeyStatus = job.journeyStatus ?? (job.sharingActive ? "tracking" : "idle");
  const journeyLabel = job.journeyStatusLabel ?? (job.sharingActive ? "Driver on the way" : "Driver preparing");
  const driverPaymentStatus =
    job.driverPaymentStatus ??
    (journeyStatus === "completed" && job.driverPayAmount ? "due" : undefined);
  const driverPaymentPaid =
    driverPaymentStatus === "paid" || driverPaymentStatus === "sent";
  const driverJourneyStep =
    journeyStatus === "completed"
      ? 3
      : journeyStatus === "arrived_pickup" ||
          journeyStatus === "en_route" ||
          journeyStatus === "arrived_destination"
        ? 2
        : journeyStatus === "tracking"
          ? 1
          : 0;
  // Customer update actions must not wait for the GPS tracking window.
  const canOperateJourney =
    !isRefunded &&
    (isOwner || isAcceptedAssignment) &&
    journeyStatus !== "completed";
  const allowedActions: JourneyAction[] = (() => {
    const raw =
      job.allowedJourneyActions ??
      (journeyStatus === "idle" || journeyStatus === "stopped"
        ? (["start_tracking", "arrived_pickup"] as JourneyAction[])
        : journeyStatus === "tracking"
          ? (["start_tracking", "arrived_pickup"] as JourneyAction[])
          : journeyStatus === "arrived_pickup"
            ? (["complete_journey"] as JourneyAction[])
            : journeyStatus === "en_route"
              ? (["arrived_destination"] as JourneyAction[])
              : journeyStatus === "arrived_destination"
                ? (["complete_journey"] as JourneyAction[])
                : []);
    return raw.filter((action) => action !== "stop_tracking");
  })();

  useEffect(() => {
    if (!showRecordedRoute) {
      setRecordedRoute([]);
      return;
    }

    let cancelled = false;

    void fetchDriverLocationHistory(driverKey, job.token)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRecordedRoute(result.points.map((point) => ({ lat: point.lat, lng: point.lng })));
      })
      .catch(() => {
        if (!cancelled) {
          setRecordedRoute([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [driverKey, job.token, job.driverLocationPointCount, showRecordedRoute]);

  const openAssignForm = () => {
    setAssignMessage(null);
    setError(null);
    setAssignFormOpen(true);
  };

  const toggleSharing = async () => {
    setBusy(true);
    setError(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
        onSessionChange(job.token, null);
      } else {
        if (activeToken) {
          await setDriverSharing(driverKey, activeToken, false);
          onSessionChange(activeToken, null);
        }
        await setDriverSharing(driverKey, job.token, true);
        onSharingChange(job.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sharing");
    } finally {
      setBusy(false);
    }
  };

  const runJourneyAction = async (action: JourneyAction) => {
    if (journeyActionInFlightRef.current) {
      return;
    }
    if (!isOwner && (!isAcceptedAssignment || !allowedActions.includes(action))) {
      setError("Only the next journey action is available");
      return;
    }

    journeyActionInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "start_tracking" && activeToken && activeToken !== job.token) {
        try {
          await postJourneyAction(driverKey, activeToken, "stop_tracking");
        } catch {
          /* previous job may already be stopped */
        }
        onSessionChange(activeToken, null);
      }

      const result = await postJourneyAction(driverKey, job.token, action);
      const nextJob: DriverJob = {
        ...job,
        journeyStatus: result.journeyStatus,
        journeyStatusLabel: result.journeyStatusLabel,
        allowedJourneyActions: result.allowedActions,
        sharingActive: result.sharingActive,
        trackingStartedAt: result.trackingStartedAt ?? job.trackingStartedAt,
        arrivedPickupAt: result.arrivedPickupAt ?? job.arrivedPickupAt,
        journeyStartedAt: result.journeyStartedAt ?? job.journeyStartedAt,
        arrivedDestinationAt: result.arrivedDestinationAt ?? job.arrivedDestinationAt,
        journeyCompletedAt: result.journeyCompletedAt ?? job.journeyCompletedAt,
        trackUrl: result.trackUrl || job.trackUrl,
        driver: result.sharingActive ? job.driver : null,
      };
      onUpdated(nextJob);

      // WhatsApp click-to-chat after recording arrival (manual Send). Keep Resend/email as-is.
      if (isOwner && action === "arrived_pickup") {
        const mobile = job.customerMobile?.trim() || "";
        if (mobile) {
          let vehicle = null as
            | { colour: string; make: string; model: string; registration: string }
            | null;
          const assigned = job.assignedDriverName?.trim();
          try {
            if (assigned) {
              const profile = await fetchDriverVehicle(driverKey, assigned);
              if (
                profile?.colour?.trim() &&
                profile.make?.trim() &&
                profile.model?.trim() &&
                profile.registration?.trim()
              ) {
                vehicle = {
                  colour: profile.colour.trim(),
                  make: profile.make.trim(),
                  model: profile.model.trim(),
                  registration: profile.registration.trim().toUpperCase(),
                };
              }
            }
            if (!vehicle && isOwner) {
              const { profile, complete } = await fetchOwnerAccountProfile(driverKey);
              if (
                complete &&
                profile?.colour?.trim() &&
                profile.make?.trim() &&
                profile.model?.trim() &&
                profile.registration?.trim()
              ) {
                vehicle = {
                  colour: profile.colour.trim(),
                  make: profile.make.trim(),
                  model: profile.model.trim(),
                  registration: profile.registration.trim().toUpperCase(),
                };
              }
            }
          } catch {
            vehicle = null;
          }

          // Return-leg jobs already store the leg's pickup on pickupLabel.
          const message = buildArrivedPickupWhatsAppMessage({
            isAirportPickup: isAirportPickupLabel(job.pickupLabel || ""),
            vehicle,
          });
          const href = buildArrivedPickupWhatsAppLink(mobile, message);
          const opened = window.open(href, "_blank", "noopener,noreferrer");
          if (!opened) {
            window.location.assign(href);
          }
        }
      }

      // Optional WhatsApp for Driver on the way (manual Send / Live Location).
      if (isOwner && action === "start_tracking") {
        const mobile = job.customerMobile?.trim() || "";
        if (mobile) {
          const href = buildDriverOnTheWayWhatsAppLink(mobile);
          const opened = window.open(href, "_blank", "noopener,noreferrer");
          if (!opened) {
            window.location.assign(href);
          }
        }
      }

      if (result.sharingActive) {
        onSharingChange(job.token);
        if (result.trackingSession?.sessionToken) {
          onSessionChange(job.token, result.trackingSession.sessionToken);
        }
      } else {
        onSharingChange(null);
        onSessionChange(job.token, null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update journey");
    } finally {
      journeyActionInFlightRef.current = false;
      setBusy(false);
    }
  };

  const openJourneyEvidence = async () => {
    if (!isOwner) {
      return;
    }
    setEvidenceBusy(true);
    setError(null);
    try {
      const result = await fetchJourneyEvidence(driverKey, {
        token: job.token,
        paymentReference: job.paymentReference,
      });
      setEvidence(result.evidence);
      setEvidenceOpen(true);
      if (result.evidence.points.length > 0) {
        setRecordedRoute(result.evidence.points.map((point) => ({ lat: point.lat, lng: point.lng })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load journey record");
    } finally {
      setEvidenceBusy(false);
    }
  };

  const deassignFromDriver = async () => {
    setAssignBusy(true);
    setError(null);

    try {
      const result = await deassignJob(driverKey, job.token);
      onAssignmentUpdated(result.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deassign job");
    } finally {
      setAssignBusy(false);
    }
  };

  const respondToAssignment = async (action: "accept" | "decline") => {
    setAssignmentBusy(true);
    setError(null);

    try {
      const result = await respondToJobAssignment(driverKey, job.token, action);
      onAssignmentUpdated(result.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update assignment");
    } finally {
      setAssignmentBusy(false);
    }
  };

  const startRefund = () => {
    setRefundMessage(null);
    setRefundConfirmOpen(true);
  };

  const cancelRefund = () => {
    setRefundConfirmOpen(false);
    setRefundMessage(null);
    setRefundConfirmKey("");
    setRefundFinalConfirm(false);
  };

  const openEdit = () => {
    setEditForm({
      tripDate: job.tripDate,
      tripTime: job.tripTime,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      customerMobile: job.customerMobile,
      flightNumber: job.flightNumber ?? "",
    });
    setEditMessage(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setEditBusy(true);
    setEditMessage(null);
    setError(null);

    try {
      const result = await updateDriverBooking(driverKey, {
        token: job.token,
        tripDate: editForm.tripDate,
        tripTime: editForm.tripTime,
        pickupLabel: editForm.pickupLabel,
        dropoffLabel: editForm.dropoffLabel,
        ...(isOwner ? { customerMobile: editForm.customerMobile } : {}),
        flightNumber: editForm.flightNumber,
      });

      onUpdated(result.job);
      setEditOpen(false);
      setEditMessage("Booking updated.");
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : "Could not update booking");
    } finally {
      setEditBusy(false);
    }
  };

  const confirmRefund = async () => {
    const paymentReference = job.paymentReference?.trim();
    if (!paymentReference) {
      setRefundMessage("This job has no payment reference.");
      return;
    }
    if (!refundConfirmKey.trim()) {
      setRefundMessage("Re-enter OWNER_ACCESS_KEY to confirm this refund.");
      return;
    }
    if (!refundFinalConfirm) {
      setRefundMessage("Tick the final confirmation box before continuing.");
      return;
    }

    setRefundBusy(true);
    setRefundMessage(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      }

      const result = await issueBookingRefund({
        ownerKey: driverKey,
        confirmOwnerKey: refundConfirmKey.trim(),
        paymentReference,
        trackingToken: job.token,
        ownerNotes: "Owner dashboard job card — full refund + cancel",
      });

      if (!result.ok) {
        setRefundMessage(result.error ?? "Refund could not be completed.");
        return;
      }

      setRefundConfirmOpen(false);
      setRefundConfirmKey("");
      setRefundFinalConfirm(false);
      setRefundMessage(
        result.alreadyRefunded || result.alreadyProcessed
          ? `Already processed (${result.refundAmount ?? "paid amount"}).`
          : `Refund issued: ${result.refundAmount ?? "paid amount"}. Customer emailed, calendar updated.`,
      );
      onRefunded(job.token, result.refundAmount);
    } catch (err) {
      setRefundMessage(err instanceof Error ? err.message : "Refund could not be completed.");
    } finally {
      setRefundBusy(false);
    }
  };

  const confirmExternalRefund = async () => {
    const paymentReference = job.paymentReference?.trim();
    if (!paymentReference) {
      setRefundMessage("This job has no payment reference.");
      return;
    }

    setRefundBusy(true);
    setRefundMessage(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      }

      const result = await markBookingRefundedExternally({
        ownerKey: driverKey,
        confirmOwnerKey: driverKey,
        paymentReference,
        trackingToken: job.token,
      });

      if (!result.ok) {
        setRefundMessage(result.error ?? "Could not mark booking as refunded.");
        return;
      }

      setExternalRefundConfirmOpen(false);
      setRefundConfirmOpen(false);
      setRefundMessage(
        result.alreadyProcessed || result.alreadyRefunded
          ? "Already closed as refunded."
          : "Marked as refunded externally — no SumUp call, no refund email. Journey closed.",
      );
      onRefunded(job.token, result.refundAmount);
    } catch (err) {
      setRefundMessage(
        err instanceof Error ? err.message : "Could not mark booking as refunded.",
      );
    } finally {
      setRefundBusy(false);
    }
  };

  const confirmDriverPayment = async () => {
    setPaymentBusy(true);
    setPaymentMessage(null);
    try {
      const result = await sendDriverPayment(driverKey, job.token, paymentAmount);
      onUpdated({
        ...job,
        driverPaymentStatus: result.payment.status,
        driverPaymentAmount: result.payment.amount,
        driverPaymentSentAt: result.payment.sentAt,
        driverPaymentHistory: result.payment.history,
      });
      setPaymentOpen(false);
      setPaymentMessage(
        result.idempotent
          ? "Driver payment was already recorded as paid."
          : `Payment recorded as paid: ${result.payment.amount}.`,
      );
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Could not record driver payment");
    } finally {
      setPaymentBusy(false);
    }
  };

  return (
    <article
      id={`owner-job-${job.token}`}
      className={`rounded-2xl border p-6 ${
        isRefunded
          ? "border-red-400/20 bg-red-500/[0.04] opacity-90"
          : highlightPending
            ? "border-amber-400/35 bg-amber-500/[0.05] shadow-[0_0_0_1px_rgba(251,191,36,0.08)]"
            : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{job.customerName}</h2>
          <p className="mt-1 text-sm text-white/60">
            {job.pickupDisplay} · {job.pickupLabel}
          </p>
          <p className="mt-1 text-sm text-white/60">To {job.dropoffLabel}</p>
          {job.isAirportPickup && job.flightNumber && (
            <p className="mt-2 text-sm font-semibold text-emerald">
              Flight {job.flightNumber}
              {job.airportCode ? ` · ${job.airportCode}` : ""}
            </p>
          )}
          {(isOwner || isAcceptedAssignment) && job.customerMobile && (
            <p className="mt-2 text-sm text-emerald">{job.customerMobile}</p>
          )}
          {isOwner && job.amountPaidLabel && (
            <p className="mt-1 text-sm text-white/70">Paid: {job.amountPaidLabel}</p>
          )}
          {!isOwner && job.driverPayAmount ? (
            <p className="mt-2 text-sm font-semibold text-emerald">
              Your pay for this journey:{" "}
              {formatDriverPayAmount(job.driverPayAmount)}
            </p>
          ) : null}
          {!isOwner && (job.passengers != null || job.suitcases != null) ? (
            <p className="mt-1 text-sm text-white/65">
              {formatPassengerSuitcaseCounts(job.passengers, job.suitcases)}
            </p>
          ) : null}
          {isOwner && isRefunded && (job.refundAmountLabel || job.amountPaidLabel) && (
            <p className="mt-1 text-sm font-semibold text-red-200">
              Refunded: {job.refundAmountLabel ?? job.amountPaidLabel}
            </p>
          )}
          {isOwner && (job.paymentReference || job.bookingReference) && (
            <p className="mt-1 text-xs text-white/40">
              Ref: {job.paymentReference ?? job.bookingReference}
            </p>
          )}
          <p className="mt-2 text-sm font-semibold text-emerald">
            Journey:{" "}
            {isOwner && journeyStatus === "completed" && driverPaymentStatus === "due"
              ? "Completed — Payment Due"
              : journeyLabel}
            {SERVICE_FLAGS.liveDriverTracking && isOwner && job.sharingActive ? " · GPS live" : ""}
          </p>
          {SERVICE_FLAGS.liveDriverTracking && isOwner && isActive && gpsStale && (
            <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
              Location has not updated for 2 minutes — reopen this page and keep it open while
              driving. iPhone may pause GPS when Safari is locked or in the background.
            </p>
          )}
          {SERVICE_FLAGS.liveDriverTracking && isOwner && isActive && lastGpsAt && !gpsStale && (
            <p className="mt-1 text-xs text-white/45">
              Last GPS update {Math.max(1, Math.round((Date.now() - lastGpsAt) / 1000))}s ago
            </p>
          )}
          {SERVICE_FLAGS.liveDriverTracking &&
            isOwner &&
            job.sharingActive &&
            job.activeDriverName && (
            <p className="mt-2 text-sm font-semibold text-emerald">
              {job.activeDriverName} is sharing live location
            </p>
          )}
          {!isRefunded && !isOwner && !isPendingForDriver && (
            <p className="mt-2 text-sm text-white/55">{assignmentSummary(job)}</p>
          )}
          {SERVICE_FLAGS.liveDriverTracking &&
            isOwner &&
            (job.driverLocationPointCount ?? 0) > 0 && (
            <p className="mt-2 text-xs text-white/50">
              {job.driverLocationPointCount} GPS points recorded for journey evidence
            </p>
          )}
        </div>
        {isRefunded ? (
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-200">
            Refunded · Job cancelled
          </span>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {!isOwner && isPendingForDriver && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                Action required
              </span>
            )}
            {job.journeyLeg === "return" ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-100">
                Return journey
              </span>
            ) : job.journeyLeg === "outbound" ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                Outbound
              </span>
            ) : null}
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${assignmentBadgeClass(job.assignmentStatus)}`}
            >
              {assignmentSummary(job)}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                job.trackingWindow.open ? "bg-emerald/15 text-emerald" : "bg-white/10 text-white/50"
              }`}
            >
              {isOwner && job.sharingActive && job.activeDriverName
                ? `${job.activeDriverName} live`
                : !isOwner && isAcceptedAssignment
                  ? "Journey actions"
                  : job.trackingWindow.open
                    ? "Window open"
                    : compactTracking
                      ? "Upcoming"
                      : "Not yet open"}
            </span>
          </div>
        )}
      </div>

      {isPendingForDriver && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-white/60">
            Customer name, mobile number, full addresses and journey details unlock immediately
            after acceptance.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={assignmentBusy}
              onClick={() => void respondToAssignment("accept")}
              className="rounded-xl bg-emerald px-5 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {assignmentBusy ? "Saving…" : "Accept job"}
            </button>
            <button
              type="button"
              disabled={assignmentBusy}
              onClick={() => void respondToAssignment("decline")}
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <DriverFlightPanel job={job} onRefresh={onRefreshJob} refreshing={refreshingJob} />

      {isOwner && !isRefunded && assignFormOpen ? (
        <div className="mt-5">
          <OwnerAssignDriverPanel
            ownerKey={driverKey}
            trackingToken={job.token}
            mode={
              assignmentStatus === "pending" || assignmentStatus === "accepted"
                ? "reassign"
                : "assign"
            }
            currentDriverName={job.assignedDriverName}
            assignmentHistory={job.assignmentHistory}
            onClose={() => setAssignFormOpen(false)}
            onAssigned={(nextJob) => {
              onAssignmentUpdated(nextJob);
              setAssignForm({
                driverFirstName: nextJob.assignedDriverName ?? "",
                driverEmail: "",
                driverMobile: nextJob.assignedDriverMobile ?? "",
                driverCarMake: nextJob.assignedDriverCarMake ?? "",
                driverCarModel: nextJob.assignedDriverCarModel ?? "",
                driverCarColour: nextJob.assignedDriverCarColour ?? "",
                driverReg: nextJob.assignedDriverReg ?? "",
                driverPayAmount: nextJob.driverPayAmount ?? "",
              });
              setAssignMessage(
                `Assigned to ${nextJob.assignedDriverName ?? "driver"}. Waiting for them to confirm.`,
              );
              setAssignFormOpen(false);
            }}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {isOwner && !isRefunded && (
          <>
            <button
              type="button"
              disabled={assignBusy}
              onClick={() => (assignFormOpen ? setAssignFormOpen(false) : openAssignForm())}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {assignmentStatus === "pending" || assignmentStatus === "accepted"
                ? "Reassign driver"
                : "Assign driver"}
            </button>
            {isAssigned && (
              <button
                type="button"
                disabled={assignBusy}
                onClick={() => void deassignFromDriver()}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
              >
                {assignBusy ? "Removing…" : "Deassign"}
              </button>
            )}
          </>
        )}

        {!isOwner && isAcceptedAssignment && !isRefunded && (
          <div className="w-full space-y-3" data-driver-primary-journey-controls>
            <div className="flex flex-col gap-3.5">
            {DRIVER_JOURNEY_STEPS.map((item, index) => {
              const complete = driverJourneyStep > index;
              const current = driverJourneyStep === index;
              const enabled =
                canOperateJourney && current && allowedActions.includes(item.action);
              const confirming = enabled && journeyConfirmAction === item.action;
              const confirmCopy = ownerPrimaryJourneyConfirmCopy(item.action);
              return (
                <div
                  key={item.action}
                  className="space-y-2"
                  data-driver-journey-action-wrap={item.action}
                >
                  <button
                    type="button"
                    disabled={busy || !enabled}
                    data-driver-journey-action={item.action}
                    aria-expanded={confirming}
                    onClick={() => {
                      if (busy || !enabled) return;
                      setJourneyConfirmAction((selected) =>
                        selected === item.action ? null : item.action,
                      );
                    }}
                    className={
                      enabled
                        ? primaryJourneyButtonClass(item.action)
                        : "min-h-14 w-full cursor-default rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-base font-bold text-white/45"
                    }
                  >
                    {busy && confirming
                      ? "Updating…"
                      : complete
                        ? item.completedLabel
                        : item.label}
                  </button>
                  {confirming ? (
                    <div
                      className="rounded-xl border border-white/15 bg-navy/80 p-3"
                      data-driver-journey-confirm={item.action}
                      role="group"
                      aria-label={confirmCopy.title}
                    >
                      <p className="text-sm font-semibold text-white">{confirmCopy.title}</p>
                      {confirmCopy.body ? (
                        <p className="mt-1 text-xs leading-relaxed text-white/65">
                          {confirmCopy.body}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          data-driver-journey-confirm-yes={item.action}
                          onClick={() => {
                            setJourneyConfirmAction(null);
                            void runJourneyAction(item.action);
                          }}
                          className={
                            item.action === "complete_journey"
                              ? "min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
                              : "min-h-12 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
                          }
                        >
                          {busy ? "Updating…" : confirmCopy.confirmLabel}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          data-driver-journey-confirm-cancel={item.action}
                          onClick={() => setJourneyConfirmAction(null)}
                          className="min-h-11 w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/85 disabled:opacity-60"
                        >
                          {confirmCopy.cancelLabel}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            </div>
          </div>
        )}

        {canOperateJourney && isOwner && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {(journeyStatus === "arrived_pickup"
              ? allowedActions.filter(
                  (action) => action === "complete_journey" || action === "stop_tracking",
                )
              : allowedActions
            ).map((action) => {
              const isArrivedCta = action === "arrived_pickup";
              const primary =
                action === "start_tracking" ||
                action === "arrived_pickup" ||
                action === "start_journey" ||
                action === "arrived_destination" ||
                action === "complete_journey";
              const danger = action === "stop_tracking";
              return (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  onClick={() => void runJourneyAction(action)}
                  className={`flex-1 rounded-xl px-4 py-3 font-semibold transition-colors disabled:opacity-60 sm:flex-none ${
                    isArrivedCta
                      ? "min-h-12 text-base font-bold bg-emerald text-navy hover:bg-emerald/90"
                      : danger
                        ? "min-h-11 text-sm bg-red-500/20 text-red-200 hover:bg-red-500/30"
                        : primary
                          ? "min-h-11 text-sm bg-emerald text-navy hover:bg-emerald/90"
                          : "min-h-11 text-sm border border-white/15 text-white hover:border-white/30"
                  }`}
                >
                  {busy ? "Updating…" : JOURNEY_ACTION_LABELS[action]}
                </button>
              );
            })}
          </div>
        )}

        {isOwner && (job.driverLocationPointCount ?? 0) > 0 && (
          <button
            type="button"
            disabled={evidenceBusy}
            onClick={() => void openJourneyEvidence()}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
          >
            {evidenceBusy ? "Loading…" : "Journey record"}
          </button>
        )}

        {!canOperateJourney && canShare && SERVICE_FLAGS.liveDriverTracking && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleSharing()}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isActive
                ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                : "bg-emerald text-navy hover:bg-emerald/90"
            }`}
          >
            {isActive ? "Stop sharing location" : "Start sharing location"}
          </button>
        )}
        {!isRefunded && isOwner && (assignmentStatus === "pending" || assignmentStatus === "accepted") ? (
          <a
            href={buildWhatsAppDriverDetailsLink({
              customerName: job.customerName,
              customerMobile: job.customerMobile,
              tripDate: job.tripDate,
              tripTime: job.tripTime,
              driverName: job.assignedDriverName || assignForm.driverFirstName,
              driverMobile: job.assignedDriverMobile || assignForm.driverMobile,
              carMake: job.assignedDriverCarMake || assignForm.driverCarMake,
              carModel: job.assignedDriverCarModel || assignForm.driverCarModel,
              carColour: job.assignedDriverCarColour || assignForm.driverCarColour,
              reg: job.assignedDriverReg || assignForm.driverReg,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Send via WhatsApp
          </a>
        ) : null}
        {canEdit && !editOpen && (
          <button
            type="button"
            onClick={openEdit}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Edit booking
          </button>
        )}
        {isOwner && journeyStatus === "completed" && driverPaymentStatus === "due" ? (
          <button
            type="button"
            onClick={() => setPaymentOpen((open) => !open)}
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy hover:bg-emerald/90"
          >
            Send Payment
          </button>
        ) : null}
        {canRefund && !refundConfirmOpen && !externalRefundConfirmOpen && (
          <button
            type="button"
            disabled={refundBusy}
            onClick={startRefund}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
          >
            Issue refund
          </button>
        )}
        {canMarkExternal && !externalRefundConfirmOpen && !refundConfirmOpen && (
          <button
            type="button"
            disabled={refundBusy}
            onClick={() => {
              setRefundConfirmOpen(false);
              setExternalRefundConfirmOpen(true);
              setRefundMessage(null);
            }}
            className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
          >
            Mark as refunded
          </button>
        )}
        {showDemoRefund && (
          <button
            type="button"
            disabled
            title="Refunds are disabled in preview mode"
            className="cursor-not-allowed rounded-xl border border-red-400/20 bg-red-500/5 px-4 py-2.5 text-sm font-semibold text-red-200/60"
          >
            Issue refund
          </button>
        )}
      </div>

      {!isOwner && isAcceptedAssignment && job.journeyNotes ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
          Journey notes: {job.journeyNotes}
        </p>
      ) : null}

      {!isOwner && journeyStatus === "completed" && driverPaymentStatus ? (
        <div
          className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          data-driver-payment-status
        >
          <p className="text-sm font-semibold text-white">
            Payment status: {driverPaymentPaid ? "Paid" : "Payment pending"}
          </p>
          <p className="mt-1 text-sm text-white/60">
            Your journey pay: {formatDriverPayAmount(job.driverPayAmount)}
          </p>
        </div>
      ) : null}

      {isOwner && journeyStatus === "completed" && driverPaymentStatus ? (
        <div className="mt-4 rounded-xl border border-emerald/20 bg-emerald/[0.05] p-4">
          <p className="text-sm font-semibold text-white">
            Driver payment: {driverPaymentPaid ? "Paid" : "Payment Due"}
          </p>
          <p className="mt-1 text-sm text-white/65">
            Amount: {job.driverPaymentAmount ?? formatDriverPayAmount(job.driverPayAmount)}
          </p>
          {paymentOpen && driverPaymentStatus === "due" ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-white/70">
                Payment amount
                <input
                  type="text"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald sm:max-w-xs"
                />
              </label>
              <p className="text-xs text-white/45">
                This records the owner-authorised driver payout only. It does not charge or refund the customer.
              </p>
              <button
                type="button"
                disabled={paymentBusy}
                onClick={() => void confirmDriverPayment()}
                className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-60"
              >
                {paymentBusy ? "Recording…" : "Confirm payment paid"}
              </button>
            </div>
          ) : null}
          {(job.driverPaymentHistory?.length ?? 0) > 0 ? (
            <ul className="mt-4 space-y-1 text-xs text-white/55">
              {job.driverPaymentHistory?.map((entry, index) => (
                <li key={`${entry.at}-${entry.status}-${index}`}>
                  {new Date(entry.at).toLocaleString("en-GB")} — {entry.status === "due" ? "Payment due" : "Paid"} — {entry.amount}
                </li>
              ))}
            </ul>
          ) : null}
          {paymentMessage ? <p className="mt-3 text-sm text-emerald">{paymentMessage}</p> : null}
        </div>
      ) : null}

      {canEdit && editOpen && (
        <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 p-4">
          <p className="text-sm font-semibold text-white">Edit booking</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-white/70">
              Date
              <input
                type="date"
                value={editForm.tripDate}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, tripDate: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70">
              Time
              <input
                type="time"
                value={editForm.tripTime}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, tripTime: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70 sm:col-span-2">
              Pickup
              <input
                type="text"
                value={editForm.pickupLabel}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, pickupLabel: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70 sm:col-span-2">
              Drop-off
              <input
                type="text"
                value={editForm.dropoffLabel}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, dropoffLabel: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            {isOwner && (
              <label className="block text-sm text-white/70">
                Mobile
                <input
                  type="tel"
                  value={editForm.customerMobile}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, customerMobile: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                />
              </label>
            )}
            <label className={`block text-sm text-white/70 ${isOwner ? "" : "sm:col-span-2"}`}>
              Flight number
              <input
                type="text"
                value={editForm.flightNumber}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, flightNumber: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void saveEdit()}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {editBusy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => setEditOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editMessage && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {editMessage}
        </p>
      )}

      {canRefund && refundConfirmOpen && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-100">Confirm full refund + cancel</p>
          <p className="mt-2 text-sm leading-relaxed text-red-100/85">
            This will refund the customer via SumUp, email them a confirmation, mark the job as
            cancelled in your calendar, and show it as refunded on this dashboard. Unlocking the
            dashboard is not enough — re-enter the owner key below.
          </p>
          <label className="mt-3 block text-sm text-red-50">
            Re-enter OWNER_ACCESS_KEY
            <input
              type="password"
              autoComplete="off"
              value={refundConfirmKey}
              disabled={refundBusy}
              onChange={(event) => setRefundConfirmKey(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-amber-50">
            <input
              type="checkbox"
              checked={refundFinalConfirm}
              disabled={refundBusy}
              onChange={(event) => setRefundFinalConfirm(event.target.checked)}
              className="mt-1"
            />
            <span>
              Refund the remaining balance to the original payment method for{" "}
              {job.paymentReference} and cancel the booking?
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={refundBusy || !refundFinalConfirm || !refundConfirmKey.trim()}
              onClick={() => void confirmRefund()}
              className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {refundBusy ? "Processing refund…" : "Confirm refund"}
            </button>
            <button
              type="button"
              disabled={refundBusy}
              onClick={cancelRefund}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {canMarkExternal && externalRefundConfirmOpen && (
        <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-50">
            Has this customer already been refunded manually in SumUp?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-50/85">
            Only use this if you have already refunded the customer outside this website. This will
            NOT send money. It does not call SumUp, closes the booking as Cancelled / Refunded,
            removes it from Upcoming, and keeps the original payment for audit. No refund email is
            sent.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={refundBusy}
              onClick={() => void confirmExternalRefund()}
              className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60"
            >
              {refundBusy ? "Closing…" : "Yes — close as refunded"}
            </button>
            <button
              type="button"
              disabled={refundBusy}
              onClick={() => setExternalRefundConfirmOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {refundMessage && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {refundMessage}
        </p>
      )}

      {isPendingForDriver && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          You&apos;ve been assigned this job. Accept or decline when you&apos;re ready.
        </p>
      )}

      {isOwner && isActive && (
        <p className="mt-4 text-sm text-emerald">
          Sharing live location for this job. Keep this page open while driving — GPS pauses if
          the phone locks or Safari goes to the background.
        </p>
      )}

      {isOwner && driverSharingLive && !isActive && (
        <p className="mt-4 text-sm text-emerald">
          {job.activeDriverName ?? "Driver"}&apos;s live location is on the map below.
        </p>
      )}

      {isOwner && job.customerSharingActive && !job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-white/60">
          Customer has opted in to share location — waiting for their GPS update.
        </p>
      )}

      {isOwner && job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-emerald">
          Customer location is live on the map below.
        </p>
      )}

      {isOwner && showRecordedRoute && recordedRoute.length > 0 && !driverSharingLive && (
        <p className="mt-4 text-sm text-white/60">
          Recorded driver route shown below — supporting journey evidence for this booking.
        </p>
      )}

      {showMap && (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <LiveTrackMap markers={mapMarkers} route={recordedRoute} />
        </div>
      )}

      {evidenceOpen && evidence && (
        <div className="mt-5 rounded-xl border border-emerald/25 bg-emerald/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                Journey record
              </p>
              <h3 className="mt-1 text-lg font-bold text-white">{evidence.customerName}</h3>
              <p className="mt-1 text-sm text-white/65">
                Ref {evidence.bookingReference}
                {evidence.amountPaid ? ` · ${evidence.amountPaid}` : ""}
                {evidence.paymentStatus ? ` · ${evidence.paymentStatus}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEvidenceOpen(false)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80"
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-xs text-white/50">{evidence.disclaimer}</p>
          <dl className="mt-4 grid gap-3 text-sm text-white/75 sm:grid-cols-2">
            <div>
              <dt className="text-white/40">Pickup</dt>
              <dd>{evidence.pickupLabel}</dd>
            </div>
            <div>
              <dt className="text-white/40">Destination</dt>
              <dd>{evidence.dropoffLabel}</dd>
            </div>
            <div>
              <dt className="text-white/40">Scheduled</dt>
              <dd>{evidence.pickupDisplay}</dd>
            </div>
            <div>
              <dt className="text-white/40">Status</dt>
              <dd>{evidence.journeyStatusLabel}</dd>
            </div>
            <div>
              <dt className="text-white/40">Tracking start</dt>
              <dd>{evidence.trackingStartedAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Arrived pickup</dt>
              <dd>{evidence.arrivedPickupAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Journey start</dt>
              <dd>{evidence.journeyStartedAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Arrived destination</dt>
              <dd>{evidence.arrivedDestinationAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Completed</dt>
              <dd>{evidence.journeyCompletedAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Duration</dt>
              <dd>
                {typeof evidence.durationMinutes === "number"
                  ? `${evidence.durationMinutes} min`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/40">GPS points</dt>
              <dd>
                {evidence.pointCount}
                {evidence.points.some((p) => typeof p.accuracyMeters === "number")
                  ? ` · accuracy recorded where available`
                  : ""}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-white/45">
            Full Journey Evidence (map, timeline, print/PDF) opens in a dedicated owner-only page.
            {job.paymentReference ? (
              <>
                {" "}
                <a
                  href={`/owner/journey-evidence/?ref=${encodeURIComponent(job.paymentReference)}`}
                  className="font-semibold text-emerald underline"
                >
                  Open Journey Evidence
                </a>
              </>
            ) : (
              <>
                {" "}
                {/* Fallback only when no payment reference exists (legacy / unlinked job). */}
                <a
                  href={`/owner/journey-evidence/?token=${encodeURIComponent(job.token)}`}
                  className="font-semibold text-emerald underline"
                >
                  Open Journey Evidence
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {assignMessage && <p className="mt-3 text-sm text-emerald">{assignMessage}</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </article>
  );
}

export default function DriverPageClient({
  portal = "driver",
}: {
  portal?: "owner" | "driver";
} = {}) {
  const isOwnerPortal = portal === "owner";
  const keyStorage = portalKeyStorage(portal);
  const [driverKey, setDriverKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [ownerToolTab, setOwnerToolTab] = useState<OwnerDashboardToolTab>("jobs");
  const [sessionRole, setSessionRole] = useState<"owner" | "driver" | null>(
    isOwnerPortal ? "owner" : null,
  );
  const [driverName, setDriverName] = useState<string | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<string[]>([...DEMO_ROSTER]);
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [pendingJobs, setPendingJobs] = useState<DriverJob[]>([]);
  const [calendarFocusJob, setCalendarFocusJob] = useState<DriverJob | null>(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [trackingSessionToken, setTrackingSessionToken] = useState<string | null>(null);
  const [lastGpsAt, setLastGpsAt] = useState<number | null>(null);
  const [gpsStale, setGpsStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Owner defaults to Upcoming so paid jobs with future trip dates show first.
  const [view, setView] = useState<DashboardView>(isOwnerPortal ? "upcoming" : "today");
  const [selectedDate, setSelectedDate] = useState(() => todayLondonDate());
  const watchIdRef = useRef<number | null>(null);
  const demoQueryHandledRef = useRef(false);
  const portalBootstrappedRef = useRef(false);

  const handleSessionChange = useCallback((token: string, sessionToken: string | null) => {
    void token;
    setTrackingSessionToken(sessionToken);
    if (!sessionToken) {
      setLastGpsAt(null);
      setGpsStale(false);
    }
  }, []);

  const isDemoDriverSession = savedKey === DEMO_DRIVER_KEY;
  const isDemoOwnerSession = savedKey === DEMO_OWNER_KEY;
  // Owner portal can never render as the driver role — force owner for this page.
  const viewRole = isOwnerPortal
    ? "owner"
    : isDemoDriverSession
      ? "driver"
      : isDemoOwnerSession
        ? "owner"
        : sessionRole;
  const viewDriverName = isOwnerPortal
    ? null
    : isDemoDriverSession
      ? DEMO_DRIVER_NAME
      : driverName;
  const isOwnerView = viewRole === "owner";

  const today = useMemo(() => todayLondonDate(), []);
  const pendingTokens = useMemo(
    () => new Set(pendingJobs.map((job) => job.token)),
    [pendingJobs],
  );
  const visibleJobs = useMemo(() => {
    if (viewRole !== "driver" || pendingTokens.size === 0) {
      return jobs;
    }

    return jobs.filter((job) => !pendingTokens.has(job.token));
  }, [jobs, pendingTokens, viewRole]);

  const activeVisibleJobs = useMemo(() => {
    return visibleJobs.filter((job) => !isOwnerCompletedDriverJob(job));
  }, [visibleJobs]);

  const completedVisibleJobs = useMemo(() => {
    return visibleJobs.filter((job) => isOwnerCompletedDriverJob(job));
  }, [visibleJobs]);

  const groupedVisibleUpcoming = useMemo(
    () => groupJobsByDate(activeVisibleJobs),
    [activeVisibleJobs],
  );

  const groupedOwnerSchedule = useMemo(
    () => (isOwnerView ? groupOwnerJobsByDateWithCompleted(visibleJobs) : []),
    [isOwnerView, visibleJobs],
  );

  const [completedOpenDays, setCompletedOpenDays] = useState<Record<string, boolean>>({});

  function toggleCompletedDay(date: string) {
    setCompletedOpenDays((current) => ({
      ...current,
      [date]: !current[date],
    }));
  }

  const loadJobs = useCallback(
    async (key: string) => {
      setLoading(true);
      setError(null);

      try {
        const [mainResponse, pendingResponse] = await Promise.all([
          view === "upcoming"
            ? fetchDriverJobs(key, { scope: "upcoming", days: 60 })
            : fetchDriverJobs(key, {
                date: view === "today" ? today : selectedDate,
              }),
          fetchDriverJobs(key, { scope: "pending", days: 60 }),
        ]);
        setJobs(mainResponse.jobs);
        setPendingJobs(pendingResponse.jobs);
        if (key === DEMO_DRIVER_KEY) {
          setSessionRole("driver");
          setDriverName(DEMO_DRIVER_NAME);
        } else if (key === DEMO_OWNER_KEY) {
          setSessionRole("owner");
          setDriverName(null);
          setAvailableDrivers([...DEMO_ROSTER]);
        } else {
          if (mainResponse.role) {
            setSessionRole(mainResponse.role);
          }
          if (mainResponse.driverName) {
            setDriverName(mainResponse.driverName);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load jobs";
        setError(
          message.toLowerCase().includes("unauthorized") ||
            message.toLowerCase().includes("did not match")
            ? "Your driver key was not accepted. Sign out and re-enter the exact DRIVER_ACCESS_KEY from Cloudflare → Workers → reimagined-octo-meme → Secrets."
            : message,
        );
        setJobs([]);
        setPendingJobs([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedDate, today, view],
  );

  const refreshJobs = useCallback(() => {
    if (savedKey) {
      void loadJobs(savedKey);
    }
  }, [loadJobs, savedKey]);

  const handleJobUpdated = useCallback((updatedJob: DriverJob) => {
    setJobs((current) => {
      const next = current.map((entry) => (entry.token === updatedJob.token ? updatedJob : entry));
      return next.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
    });
  }, []);

  const handleAssignmentUpdated = useCallback(
    (updatedJob: DriverJob) => {
      if (viewRole === "driver" && updatedJob.assignmentStatus === "accepted") {
        setView(updatedJob.tripDate === today ? "today" : "upcoming");
      }

      setPendingJobs((current) => {
        if (updatedJob.assignmentStatus === "pending") {
          const exists = current.some((entry) => entry.token === updatedJob.token);
          const next = exists
            ? current.map((entry) => (entry.token === updatedJob.token ? updatedJob : entry))
            : [...current, updatedJob];
          return next.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
        }

        return current.filter((entry) => entry.token !== updatedJob.token);
      });

      setJobs((current) => {
        if (
          viewRole === "driver" &&
          (updatedJob.assignmentStatus === "declined" ||
            updatedJob.assignmentStatus === "unassigned" ||
            !updatedJob.assignmentStatus)
        ) {
          return current.filter((entry) => entry.token !== updatedJob.token);
        }

        const exists = current.some((entry) => entry.token === updatedJob.token);
        const next = exists
          ? current.map((entry) => (entry.token === updatedJob.token ? updatedJob : entry))
          : [...current, updatedJob];

        return next.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
      });
    },
    [today, viewRole],
  );

  const loadDriverRoster = useCallback(async (key: string) => {
    try {
      const roster = await fetchDriverRoster(key);
      if (roster.length > 0) {
        setAvailableDrivers(roster);
      }
    } catch {
      // Keep default roster if fetch fails.
    }
  }, []);

  const unlockWithKey = useCallback(
    async (rawKey: string) => {
      const trimmed = rawKey.trim();
      if (!trimmed) {
        return;
      }

      setLoading(true);
      setError(null);
      setDriverKey(trimmed);

      try {
        const keyToUse = trimmed;

        if (isOwnerPortal) {
          // Owner page: live OWNER_ACCESS_KEY, or explicit demo preview key only.
          if (keyToUse === DEMO_DRIVER_KEY) {
            setError(
              "That is the driver key. Enter your live OWNER_ACCESS_KEY for the owner dashboard.",
            );
            return;
          }
          if (keyToUse !== DEMO_OWNER_KEY) {
            const liveStatus = await fetchDriverStatus(keyToUse);
            if (!liveStatus.ok || liveStatus.role !== "owner") {
              setError(
                liveStatus.error ??
                  "That key is not the live owner key. Enter OWNER_ACCESS_KEY from Cloudflare → Workers → reimagined-octo-meme → Settings → Variables and Secrets.",
              );
              return;
            }
          }
        }

        const result = await verifyDriverAccessKey(keyToUse);
        if (!result.ok) {
          setError(
            result.message ??
              "That access key was not accepted. Check OWNER_ACCESS_KEY or DRIVER_ACCESS_KEY on the reimagined-octo-meme worker in Cloudflare.",
          );
          return;
        }

        const status = await fetchDriverStatus(keyToUse);

        if (keyToUse === DEMO_DRIVER_KEY) {
          setSessionRole("driver");
          setDriverName(DEMO_DRIVER_NAME);
        } else if (keyToUse === DEMO_OWNER_KEY) {
          setSessionRole("owner");
          setDriverName(null);
          setAvailableDrivers([...DEMO_ROSTER]);
        } else if (status.role) {
          setSessionRole(status.role);
          if (status.role === "owner") {
            setDriverName(null);
          }
        } else if (!status.ok && status.hasOwnerKey === false && !status.hasDriverKey) {
          setError(
            "No access keys are configured on the worker. Open /owner/ for the owner preview, or set OWNER_ACCESS_KEY / DRIVER_ACCESS_KEY in Cloudflare.",
          );
          return;
        }

        if (
          !isOwnerPortal &&
          keyToUse !== DEMO_DRIVER_KEY &&
          keyToUse !== DEMO_OWNER_KEY &&
          status.driverName
        ) {
          setDriverName(status.driverName);
        }
        if (keyToUse === DEMO_OWNER_KEY || status.role === "owner") {
          if (status.availableDrivers?.length) {
            setAvailableDrivers(status.availableDrivers);
          } else if (keyToUse !== DEMO_OWNER_KEY) {
            await loadDriverRoster(keyToUse);
          } else {
            setAvailableDrivers([...DEMO_ROSTER]);
          }
        }

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (url.searchParams.has("demo")) {
            url.searchParams.delete("demo");
            window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          }
        }

        window.sessionStorage.setItem(keyStorage, keyToUse);
        setDriverKey(keyToUse);
        setSavedKey(keyToUse);
        await loadJobs(keyToUse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify access key");
      } finally {
        setLoading(false);
      }
    },
    [isOwnerPortal, keyStorage, loadDriverRoster, loadJobs],
  );

  const unlock = async () => {
    await unlockWithKey(driverKey);
  };

  useEffect(() => {
    if (portalBootstrappedRef.current) {
      return;
    }
    portalBootstrappedRef.current = true;

    const stored = window.sessionStorage.getItem(keyStorage)?.trim() ?? "";

    // /owner/ — restore a live owner session only. Never auto-open the demo.
    // Always clear loading when there is no valid session so the key form shows.
    if (isOwnerPortal) {
      if (stored === DEMO_OWNER_KEY || stored === DEMO_DRIVER_KEY) {
        window.sessionStorage.removeItem(keyStorage);
        setLoading(false);
        return;
      }

      if (stored) {
        setLoading(true);
        void fetchDriverStatus(stored)
          .then((status) => {
            if (status.ok && status.role === "owner") {
              setSessionRole("owner");
              setDriverName(null);
              setSavedKey(stored);
              if (status.availableDrivers?.length) {
                setAvailableDrivers(status.availableDrivers);
              }
              void loadJobs(stored);
              return;
            }
            window.sessionStorage.removeItem(keyStorage);
            setLoading(false);
          })
          .catch(() => {
            window.sessionStorage.removeItem(keyStorage);
            setLoading(false);
          });
        return;
      }

      setLoading(false);
      return;
    }

    if (stored && stored !== DEMO_OWNER_KEY) {
      if (stored === DEMO_DRIVER_KEY) {
        setSessionRole("driver");
        setDriverName(DEMO_DRIVER_NAME);
      }
      setSavedKey(stored);
      void loadJobs(stored);
    }
  }, [isOwnerPortal, keyStorage, loadJobs, unlockWithKey]);

  useEffect(() => {
    if (!savedKey) {
      return;
    }

    void loadJobs(savedKey);

    const shouldPoll = viewRole === "driver" || view === "today";
    if (!shouldPoll) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadJobs(savedKey);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadJobs, savedKey, viewRole, view]);

  useEffect(() => {
    if (!savedKey || !activeToken || !navigator.geolocation) {
      return;
    }

    const sendPosition = (position: GeolocationPosition) => {
      setLastGpsAt(Date.now());
      setGpsStale(false);
      void postDriverLocation(
        savedKey,
        activeToken,
        position.coords.latitude,
        position.coords.longitude,
        {
          ...(trackingSessionToken ? { sessionToken: trackingSessionToken } : {}),
          ...(Number.isFinite(position.coords.accuracy)
            ? { accuracy: position.coords.accuracy }
            : {}),
          ...(typeof position.coords.speed === "number" && Number.isFinite(position.coords.speed)
            ? { speed: position.coords.speed }
            : {}),
          ...(typeof position.coords.heading === "number" &&
          Number.isFinite(position.coords.heading)
            ? { heading: position.coords.heading }
            : {}),
        },
      ).catch(() => {
        // Ignore transient GPS upload errors; next tick will retry.
      });
    };

    const onGeoError = () => {
      setGpsStale(true);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(sendPosition, onGeoError, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    });

    const staleTimer = window.setInterval(() => {
      setLastGpsAt((prev) => {
        if (prev && Date.now() - prev >= DRIVER_GPS_STALE_MS) {
          setGpsStale(true);
        }
        return prev;
      });
    }, 15_000);

    return () => {
      window.clearInterval(staleTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeToken, savedKey, trackingSessionToken]);

  useEffect(() => {
    // Soft-hidden via SERVICE_FLAGS.trackingDemo — public ?demo= links disabled when false
    if (!SERVICE_FLAGS.trackingDemo || isOwnerPortal || demoQueryHandledRef.current) {
      return;
    }

    const demoRole = readDemoQueryParam();
    if (!demoRole) {
      return;
    }

    demoQueryHandledRef.current = true;
    const wantedKey = demoRole === "owner" ? DEMO_OWNER_KEY : DEMO_DRIVER_KEY;
    if (demoRole === "owner") {
      window.location.replace("/owner/");
      return;
    }

    const stored = window.sessionStorage.getItem(DRIVER_KEY_STORAGE)?.trim();
    if (stored === wantedKey) {
      return;
    }

    window.sessionStorage.removeItem(DRIVER_KEY_STORAGE);
    setSavedKey(null);
    setSessionRole(null);
    setDriverName(null);
    setJobs([]);
    setPendingJobs([]);
    setActiveToken(null);
    void unlockWithKey(wantedKey);
  }, [isOwnerPortal, unlockWithKey]);

  useEffect(() => {
    if (!savedKey) {
      document.title = `Bookings dashboard | ${SITE.name}`;
      return;
    }

    document.title = isOwnerView
      ? `Owner dashboard | ${SITE.name}`
      : `Driver dashboard | ${SITE.name}`;
  }, [isOwnerView, savedKey]);

  const profilePanel = savedKey ? (
    isOwnerView ? (
      <>
        <OwnerAccountProfilePanel ownerKey={savedKey} />
        <DriverProfilePanel
          accessKey={savedKey}
          isOwner
          driverName={viewDriverName}
          defaultCollapsed
        />
      </>
    ) : null
  ) : null;

  return (
    <>
      <OwnerPortalHeader
        variant={isOwnerPortal ? "owner" : "driver"}
        title={isOwnerPortal ? "Owner Dashboard" : "Driver"}
      />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <div className={`mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8 ${isOwnerPortal ? "max-w-5xl" : "max-w-3xl"}`}>
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {isOwnerView
                ? "Owner dashboard"
                : !savedKey
                  ? "Driver login"
                  : "Driver dashboard"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Bookings</h1>
            <p className="mt-3 text-white/70">
              {isOwnerView ? (
                <>
                  Confirm customer enquiries, mark SumUp payments (adds to calendar), then assign a
                  driver by email with their pay for the journey. Drivers have no login — they only
                  receive the job by email and confirm from that link.
                </>
              ) : !savedKey ? (
                SERVICE_FLAGS.trackingDemo ? (
                  <>
                    Driver dashboard. For the owner view go to{" "}
                    <a href="/owner/" className="text-emerald underline-offset-2 hover:underline">
                      /owner/
                    </a>
                    .
                  </>
                ) : (
                  <>Enter your driver access key to open today&apos;s jobs.</>
                )
              ) : (
                <>
                  Accept assigned jobs at any time. Journey actions follow in order, and each
                  action asks for confirmation before it is sent. For airport pickups, your flight
                  number and live arrival status are shown on each job.
                </>
              )}
            </p>
          </header>

          {!savedKey ? (
            isOwnerPortal && loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                Checking saved owner session…
              </div>
            ) : (
            <section className="rounded-2xl border border-emerald/35 bg-emerald/5 p-6 sm:p-8">
              {/* Soft-hidden via SERVICE_FLAGS.trackingDemo — set true in data.ts to restore */}
              {SERVICE_FLAGS.trackingDemo ? (
                <>
                  <div className={`grid gap-3 ${isOwnerPortal ? "" : "sm:grid-cols-2"}`}>
                    {!isOwnerPortal && (
                      <a
                        href="/owner/"
                        className="rounded-2xl border border-emerald/40 bg-emerald/10 px-5 py-5 text-left transition-colors hover:border-emerald hover:bg-emerald/15"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                          Owner dashboard
                        </p>
                        <p className="mt-2 text-lg font-bold text-white">Go to /owner/</p>
                        <p className="mt-2 text-sm text-white/65">
                          Assign jobs, payments, refunds, GPS audit
                        </p>
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void unlockWithKey(isOwnerPortal ? DEMO_OWNER_KEY : DEMO_DRIVER_KEY)
                      }
                      className="rounded-2xl border border-white/15 bg-white/[0.02] px-5 py-5 text-left transition-colors hover:border-white/30 hover:bg-white/[0.04] disabled:opacity-60"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                        {isOwnerPortal ? "Owner preview" : "Driver preview"}
                      </p>
                      <p className="mt-2 text-lg font-bold text-white">
                        {isOwnerPortal ? "Open owner preview" : "Open driver preview"}
                      </p>
                      <p className="mt-2 text-sm text-white/65">
                        {isOwnerPortal
                          ? "Sample jobs only — uses demo-owner-key"
                          : "Sample jobs only — uses demo-driver-key"}
                      </p>
                    </button>
                  </div>
                  <div className="my-6 border-t border-white/10" />
                </>
              ) : null}

              <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                {isOwnerPortal ? "Sign in" : "Access key"}
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                {isOwnerPortal ? "Enter your owner access key" : "Enter your access key"}
              </h2>
              <label htmlFor="owner-access-key" className="mt-5 block text-sm font-medium text-white/70">
                {isOwnerPortal
                  ? "Owner access key"
                  : SERVICE_FLAGS.trackingDemo
                    ? "Or enter a live access key"
                    : "Access key"}
              </label>
              <input
                id="owner-access-key"
                name="owner-access-key"
                type="password"
                autoComplete="current-password"
                autoFocus={isOwnerPortal}
                value={driverKey}
                onChange={(event) => setDriverKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void unlock();
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder={isOwnerPortal ? "Paste your owner key" : "Paste your access key"}
              />
              <p className="mt-3 text-sm text-white/55">
                {isOwnerPortal ? (
                  <>
                    Paste the <span className="text-white/75">OWNER_ACCESS_KEY</span> from Cloudflare
                    → Workers → <span className="text-white/75">reimagined-octo-meme</span> →
                    Settings → Variables and Secrets, then tap Open dashboard.
                  </>
                ) : (
                  <>
                    Use the driver access key from Cloudflare → Workers →{" "}
                    <span className="text-white/75">reimagined-octo-meme</span>.
                    {SERVICE_FLAGS.trackingDemo
                      ? " Until that secret is set, use the preview button above."
                      : null}
                  </>
                )}
              </p>
              {error && (
                <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => void unlock()}
                disabled={loading || !driverKey.trim()}
                className="mt-5 w-full rounded-xl bg-emerald px-5 py-3.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60 sm:w-auto"
              >
                {loading ? "Checking key…" : isOwnerPortal ? "Open dashboard" : "Open with access key"}
              </button>
            </section>
            )
          ) : (
            <>
              {isDemoOwnerSession && (
                <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <p>
                    You&apos;re on the <strong>demo</strong> owner preview (sample jobs only). Sign
                    out and enter your live <strong>OWNER_ACCESS_KEY</strong> for real bookings.
                  </p>
                </div>
              )}

              {isOwnerPortal && !isDemoOwnerSession && (
                <div className="mb-6 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
                  <p>
                    Live owner dashboard — real customer bookings from the website.
                  </p>
                </div>
              )}

              {isDemoDriverSession && (
                <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <p>
                    You&apos;re on the <strong>driver</strong> dashboard — for the owner view use{" "}
                    <strong>/owner/</strong>.
                  </p>
                  <a
                    href="/owner/"
                    className="mt-3 inline-flex rounded-xl bg-emerald px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90"
                  >
                    Go to owner dashboard
                  </a>
                </div>
              )}

              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/60">
                  {SITE.name}
                  {isOwnerView
                    ? " · Owner"
                    : viewDriverName
                      ? ` · ${viewDriverName}`
                      : " · Driver"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.sessionStorage.removeItem(keyStorage);
                    setSavedKey(null);
                    setJobs([]);
                    setPendingJobs([]);
                    setActiveToken(null);
                    setSessionRole(null);
                    setDriverName(null);
                    setAvailableDrivers([]);
                    setDriverKey("");
                    setError(null);
                  }}
                  className="text-sm text-white/50 transition-colors hover:text-white"
                >
                  Sign out
                </button>
              </div>

              {isOwnerView && savedKey ? (
                <OwnerDashboardToolSwitcher
                  value={ownerToolTab}
                  onChange={setOwnerToolTab}
                />
              ) : null}

              {isOwnerView && savedKey && ownerToolTab === "personal-quotes" ? (
                <div
                  id="owner-tool-panel-personal-quotes"
                  role="tabpanel"
                  aria-labelledby="owner-tool-tab-personal-quotes"
                >
                  <OwnerPersonalQuotesPanel ownerKey={savedKey} />
                </div>
              ) : null}

              {isOwnerView && savedKey && ownerToolTab === "same-fare" ? (
                <div
                  id="owner-tool-panel-same-fare"
                  role="tabpanel"
                  aria-labelledby="owner-tool-tab-same-fare"
                >
                  <OwnerAmendmentTestPanel ownerKey={savedKey} />
                </div>
              ) : null}

              {(!isOwnerView || !savedKey || ownerToolTab === "jobs") && (
              <div
                id="owner-tool-panel-jobs"
                role={isOwnerView && savedKey ? "tabpanel" : undefined}
                aria-labelledby={
                  isOwnerView && savedKey ? "owner-tool-tab-jobs" : undefined
                }
              >
              {isOwnerView && savedKey ? (
                <OwnerFinancialSummaryPanel ownerKey={savedKey} />
              ) : null}

              {isOwnerView && savedKey ? <OwnerShortNoticePanel ownerKey={savedKey} /> : null}

              {isOwnerView && savedKey ? (
                <OwnerBookingCalendar
                  ownerKey={savedKey}
                  onSelectJob={(job) => {
                    setCalendarFocusJob(job);
                    setJobs((current) =>
                      current.some((entry) => entry.token === job.token)
                        ? current.map((entry) => (entry.token === job.token ? job : entry))
                        : [...current, job],
                    );
                    setView("date");
                    setSelectedDate(job.tripDate);
                    window.setTimeout(() => {
                      document
                        .getElementById("owner-calendar-selected-journey")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  onSelectPaymentRef={(paymentReference) => {
                    const match = jobs.find(
                      (job) => job.paymentReference?.trim() === paymentReference,
                    );
                    if (match) {
                      setCalendarFocusJob(match);
                      setView("date");
                      setSelectedDate(match.tripDate);
                      window.setTimeout(() => {
                        document
                          .getElementById("owner-calendar-selected-journey")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                  }}
                />
              ) : null}

              {isOwnerView && calendarFocusJob && savedKey ? (
                <section
                  id="owner-calendar-selected-journey"
                  className="mb-10 scroll-mt-24 rounded-2xl border border-emerald/30 bg-emerald/5 p-4 sm:p-5"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                        Selected from calendar
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-white">Journey controls</h2>
                      <p className="mt-1 text-sm text-white/60">
                        Same Owner controls as the job list — tracking, arrival, complete, edit,
                        evidence, and refund.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarFocusJob(null)}
                      className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white/70 hover:border-white/30"
                    >
                      Close
                    </button>
                  </div>
                  <DriverJobCard
                    job={
                      jobs.find((entry) => entry.token === calendarFocusJob.token) ??
                      calendarFocusJob
                    }
                    driverKey={savedKey}
                    activeToken={activeToken}
                    onSharingChange={setActiveToken}
                    onSessionChange={handleSessionChange}
                    gpsStale={gpsStale}
                    lastGpsAt={lastGpsAt}
                    onRefunded={(token, refundAmount) => {
                      setJobs((current) =>
                        current.map((entry) =>
                          entry.token === token
                            ? {
                                ...entry,
                                bookingStatus: "refunded",
                                refundAmountLabel: refundAmount ?? entry.refundAmountLabel,
                              }
                            : entry,
                        ),
                      );
                      setCalendarFocusJob((current) =>
                        current && current.token === token
                          ? {
                              ...current,
                              bookingStatus: "refunded",
                              refundAmountLabel: refundAmount ?? current.refundAmountLabel,
                            }
                          : current,
                      );
                    }}
                    onUpdated={(nextJob) => {
                      handleJobUpdated(nextJob);
                      setCalendarFocusJob(nextJob);
                    }}
                    onAssignmentUpdated={(nextJob) => {
                      handleAssignmentUpdated(nextJob);
                      setCalendarFocusJob(nextJob);
                    }}
                    onRefreshJob={calendarFocusJob.isAirportPickup ? () => void loadJobs(savedKey) : undefined}
                    refreshingJob={loading}
                    isOwner={isOwnerView}
                    availableDrivers={availableDrivers}
                  />
                </section>
              ) : null}

              {isOwnerView && savedKey ? <OwnerPaidBookingsPanel ownerKey={savedKey} /> : null}

              {isOwnerView && savedKey ? <OwnerBookingJobsPanel ownerKey={savedKey} /> : null}

              {/*
                Paid / tracking job list:
                - Always shown for owner and drivers (journey status buttons need it)
                - Customer website live-tracking UI stays soft-hidden via liveDriverTracking
              */}
              {true ? (
              <>
              {isOwnerView && !SERVICE_FLAGS.liveDriverTracking ? (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                    Paid jobs coming up
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    Use Driver on the way and Arrived at Pickup for customer updates. Website live
                    tracking links stay retired.
                  </p>
                </div>
              ) : null}
              <div className="mb-6 flex flex-wrap gap-2">
                {([
                  ["today", "Today"],
                  ["upcoming", "Upcoming"],
                  ["date", "Pick date"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setView(value);
                      if (value === "today") {
                        setSelectedDate(today);
                      }
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      view === value
                        ? "bg-emerald text-navy"
                        : "border border-white/15 text-white/75 hover:border-white/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === "date" && (
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => shiftLondonDate(current, -1))}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                  >
                    Previous day
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-xl border border-white/15 bg-navy px-4 py-2.5 text-white outline-none focus:border-emerald"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => shiftLondonDate(current, 1))}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                  >
                    Next day
                  </button>
                </div>
              )}

              {view !== "upcoming" && (
                <p className="mb-4 text-sm text-white/60">
                  Showing bookings for {formatDateHeading(view === "today" ? today : selectedDate)}
                </p>
              )}

              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  Loading bookings…
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
                  {error}
                </div>
              )}

              {!loading && !error && activeVisibleJobs.length === 0 && pendingJobs.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  {viewRole === "driver"
                    ? view === "upcoming"
                      ? "No jobs assigned to you in the next 60 days. When the owner assigns a job, it will appear at the top for you to accept."
                      : "No jobs assigned to you for this date yet."
                    : view === "upcoming"
                      ? "No unfinished paid bookings with tracking in the next 60 days."
                      : "No unfinished paid bookings with tracking for this date."}
                </div>
              )}

              {pendingJobs.length > 0 && (
                <section className="mb-8 rounded-2xl border border-amber-400/25 bg-amber-500/[0.04] p-4 sm:p-6">
                  <h2 className="mb-2 text-lg font-semibold text-white">
                    {viewRole === "driver" ? "Awaiting your acceptance" : "Awaiting driver acceptance"}
                  </h2>
                  <p className="mb-4 text-sm text-white/60">
                    {viewRole === "driver"
                      ? "Accept or decline when you are ready."
                      : "These jobs are assigned but not yet accepted by the driver."}
                  </p>
                  <div className="space-y-4">
                    {pendingJobs.map((job) => (
                      <DriverJobCard
                        key={job.token}
                        job={job}
                        driverKey={savedKey}
                        activeToken={activeToken}
                        onSharingChange={setActiveToken}
                        onSessionChange={handleSessionChange}
                        gpsStale={gpsStale}
                        lastGpsAt={lastGpsAt}
                        onRefunded={(token, refundAmount) => {
                          setJobs((current) =>
                            current.map((entry) =>
                              entry.token === token
                                ? {
                                    ...entry,
                                    bookingStatus: "refunded",
                                    refundAmountLabel: refundAmount ?? entry.refundAmountLabel,
                                  }
                                : entry,
                            ),
                          );
                          setPendingJobs((current) =>
                            current.filter((entry) => entry.token !== token),
                          );
                          if (activeToken === token) {
                            setActiveToken(null);
                          }
                        }}
                        onUpdated={handleJobUpdated}
                        onAssignmentUpdated={handleAssignmentUpdated}
                        onRefreshJob={job.isAirportPickup ? refreshJobs : undefined}
                        refreshingJob={loading}
                        highlightPending
                        compactTracking={view === "upcoming"}
                        isOwner={isOwnerView}
                        availableDrivers={availableDrivers}
                      />
                    ))}
                  </div>
                </section>
              )}

              {view === "today" && activeVisibleJobs.length > 0 && (
                <h2 className="mb-4 text-lg font-semibold text-white">Today&apos;s bookings</h2>
              )}

              {view === "upcoming" ? (
                <div className="space-y-8">
                  {isOwnerView
                    ? groupedOwnerSchedule.map((group) => (
                        <section key={group.date} className="space-y-3">
                          <h2 className="text-lg font-semibold text-white">
                            {formatDateHeading(group.date)}
                          </h2>
                          {group.upcoming.length > 0 ? (
                            <div className="space-y-4">
                              <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
                                Active jobs
                              </p>
                              {group.upcoming.map((job) => (
                                <DriverJobCard
                                  key={job.token}
                                  job={job}
                                  driverKey={savedKey}
                                  activeToken={activeToken}
                                  onSharingChange={setActiveToken}
                                  onSessionChange={handleSessionChange}
                                  gpsStale={gpsStale}
                                  lastGpsAt={lastGpsAt}
                                  onRefunded={(token, refundAmount) => {
                                    setJobs((current) =>
                                      current.map((entry) =>
                                        entry.token === token
                                          ? {
                                              ...entry,
                                              bookingStatus: "refunded",
                                              refundAmountLabel:
                                                refundAmount ?? entry.refundAmountLabel,
                                            }
                                          : entry,
                                      ),
                                    );
                                    if (activeToken === token) {
                                      setActiveToken(null);
                                    }
                                  }}
                                  onUpdated={handleJobUpdated}
                                  onAssignmentUpdated={handleAssignmentUpdated}
                                  onRefreshJob={job.isAirportPickup ? refreshJobs : undefined}
                                  refreshingJob={loading}
                                  compactTracking
                                  isOwner={isOwnerView}
                                  availableDrivers={availableDrivers}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-white/45">No active jobs for this day.</p>
                          )}
                          {group.completed.length > 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
                              <button
                                type="button"
                                onClick={() => toggleCompletedDay(group.date)}
                                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-white/80"
                                aria-expanded={completedOpenDays[group.date] === true}
                              >
                                <span>Completed jobs ({group.completed.length})</span>
                                <span className="text-emerald" aria-hidden>
                                  {completedOpenDays[group.date] ? "▲" : "▼"}
                                </span>
                              </button>
                              {completedOpenDays[group.date] ? (
                                <div className="space-y-4 border-t border-white/10 px-3 pb-3 pt-3 sm:px-4">
                                  {group.completed.map((job) => (
                                    <DriverJobCard
                                      key={`completed-${job.token}`}
                                      job={job}
                                      driverKey={savedKey}
                                      activeToken={activeToken}
                                      onSharingChange={setActiveToken}
                                      onSessionChange={handleSessionChange}
                                      gpsStale={gpsStale}
                                      lastGpsAt={lastGpsAt}
                                      onRefunded={(token, refundAmount) => {
                                        setJobs((current) =>
                                          current.map((entry) =>
                                            entry.token === token
                                              ? {
                                                  ...entry,
                                                  bookingStatus: "refunded",
                                                  refundAmountLabel:
                                                    refundAmount ?? entry.refundAmountLabel,
                                                }
                                              : entry,
                                          ),
                                        );
                                      }}
                                      onUpdated={handleJobUpdated}
                                      onAssignmentUpdated={handleAssignmentUpdated}
                                      compactTracking
                                      isOwner={isOwnerView}
                                      availableDrivers={availableDrivers}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      ))
                    : groupedVisibleUpcoming.map((group) => (
                        <section key={group.date}>
                          <h2 className="mb-4 text-lg font-semibold text-white">
                            {formatDateHeading(group.date)}
                          </h2>
                          <div className="space-y-4">
                            {group.jobs.map((job) => (
                              <DriverJobCard
                                key={job.token}
                                job={job}
                                driverKey={savedKey}
                                activeToken={activeToken}
                                onSharingChange={setActiveToken}
                                onSessionChange={handleSessionChange}
                                gpsStale={gpsStale}
                                lastGpsAt={lastGpsAt}
                                onRefunded={(token, refundAmount) => {
                                  setJobs((current) =>
                                    current.map((entry) =>
                                      entry.token === token
                                        ? {
                                            ...entry,
                                            bookingStatus: "refunded",
                                            refundAmountLabel:
                                              refundAmount ?? entry.refundAmountLabel,
                                          }
                                        : entry,
                                    ),
                                  );
                                  if (activeToken === token) {
                                    setActiveToken(null);
                                  }
                                }}
                                onUpdated={handleJobUpdated}
                                onAssignmentUpdated={handleAssignmentUpdated}
                                onRefreshJob={job.isAirportPickup ? refreshJobs : undefined}
                                refreshingJob={loading}
                                compactTracking
                                isOwner={isOwnerView}
                                availableDrivers={availableDrivers}
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {activeVisibleJobs.map((job) => (
                    <DriverJobCard
                      key={job.token}
                      job={job}
                      driverKey={savedKey}
                      activeToken={activeToken}
                      onSharingChange={setActiveToken}
                      onSessionChange={handleSessionChange}
                      gpsStale={gpsStale}
                      lastGpsAt={lastGpsAt}
                      onRefunded={(token, refundAmount) => {
                        setJobs((current) =>
                          current.map((entry) =>
                            entry.token === token
                              ? {
                                  ...entry,
                                  bookingStatus: "refunded",
                                  refundAmountLabel: refundAmount ?? entry.refundAmountLabel,
                                }
                              : entry,
                          ),
                        );
                        if (activeToken === token) {
                          setActiveToken(null);
                        }
                      }}
                      onUpdated={handleJobUpdated}
                      onAssignmentUpdated={handleAssignmentUpdated}
                      onRefreshJob={job.isAirportPickup ? refreshJobs : undefined}
                      refreshingJob={loading}
                      isOwner={isOwnerView}
                      availableDrivers={availableDrivers}
                    />
                  ))}
                </div>
              )}

              {completedVisibleJobs.length > 0 ? (
                <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
                  <button
                    type="button"
                    onClick={() => toggleCompletedDay(`view:${view}`)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                    aria-expanded={completedOpenDays[`view:${view}`] === true}
                  >
                    <span>
                      <span className="text-lg font-semibold text-white/80">
                        Completed jobs ({completedVisibleJobs.length})
                      </span>
                      <span className="mt-1 block text-sm text-white/45">
                        {isOwnerView
                          ? "Finished journeys — kept for payment records and evidence."
                          : "Finished journeys are kept here and removed from your active list."}
                      </span>
                    </span>
                    <span className="text-emerald" aria-hidden>
                      {completedOpenDays[`view:${view}`] ? "▲" : "▼"}
                    </span>
                  </button>
                  {completedOpenDays[`view:${view}`] ? (
                    <div className="mt-4 space-y-4">
                      {completedVisibleJobs.map((job) => (
                        <DriverJobCard
                          key={`completed-${job.token}`}
                          job={job}
                          driverKey={savedKey}
                          activeToken={activeToken}
                          onSharingChange={setActiveToken}
                          onSessionChange={handleSessionChange}
                          gpsStale={gpsStale}
                          lastGpsAt={lastGpsAt}
                          onRefunded={(token, refundAmount) => {
                            setJobs((current) =>
                              current.map((entry) =>
                                entry.token === token
                                  ? {
                                      ...entry,
                                      bookingStatus: "refunded",
                                      refundAmountLabel: refundAmount ?? entry.refundAmountLabel,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                          onUpdated={handleJobUpdated}
                          onAssignmentUpdated={handleAssignmentUpdated}
                          isOwner={isOwnerView}
                          availableDrivers={availableDrivers}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
              </>
              ) : null}
              </div>
              )}

              {/* Setup/settings at the bottom — Owner Profile then Additional Drivers (owner), or driver profile. */}
              {profilePanel ? <div className="mt-8">{profilePanel}</div> : null}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
