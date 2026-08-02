"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import type { MapMarker, MapRoutePoint } from "@/components/LiveTrackMap";
import {
  buildWhatsAppTrackLink,
  fetchDriverJobs,
  postDriverLocation,
  setDriverSharing,
  updateDriverBooking,
  verifyDriverAccessKey,
  fetchDriverStatus,
  assignJobToDriver,
  deassignJob,
  respondToJobAssignment,
  fetchDriverRoster,
  fetchDriverLocationHistory,
  fetchDriverVehicleProfiles,
  fetchDriverVehicle,
  saveDriverVehicle,
  type DriverJob,
} from "@/lib/tracking-api";
import { issueBookingRefund } from "@/lib/refund-api";
import { DEMO_DRIVER_KEY, DEMO_DRIVER_NAME, DEMO_OWNER_KEY, DEMO_ROSTER } from "@/lib/tracking-demo";
import { SITE } from "@/lib/data";

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-white/[0.03] text-white/60 sm:h-80">
      Loading map…
    </div>
  ),
});

const DRIVER_KEY_STORAGE = "matni-driver-key";

type DashboardView = "today" | "upcoming" | "date";

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
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
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
}: {
  accessKey: string;
  isOwner: boolean;
  driverName: string | null;
}) {
  const [profiles, setProfiles] = useState<Array<{ profileKey: string; displayName: string }>>([]);
  const [selectedProfile, setSelectedProfile] = useState(isOwner ? "owner" : driverName ?? "");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    make: "",
    model: "",
    colour: "",
    registration: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchDriverVehicleProfiles(accessKey)
      .then((nextProfiles) => {
        if (cancelled) {
          return;
        }

        setProfiles(nextProfiles);
        if (!isOwner && driverName) {
          setSelectedProfile(driverName);
        } else if (isOwner && nextProfiles.length > 0) {
          setSelectedProfile(nextProfiles[0]?.profileKey === "owner" ? "owner" : nextProfiles[0]?.displayName ?? "owner");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load vehicle profiles.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, driverName, isOwner]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchDriverVehicle(accessKey, selectedProfile)
      .then((profile) => {
        if (cancelled) {
          return;
        }

        setForm({
          displayName:
            profile?.displayName ??
            (selectedProfile === "owner"
              ? "Owner"
              : profiles.find(
                  (entry) =>
                    entry.profileKey === selectedProfile ||
                    entry.displayName === selectedProfile,
                )?.displayName ?? selectedProfile),
          email: profile?.email ?? "",
          make: profile?.make ?? "",
          model: profile?.model ?? "",
          colour: profile?.colour ?? "",
          registration: profile?.registration ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load saved vehicle details.");
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
  }, [accessKey, selectedProfile, profiles]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const result = await saveDriverVehicle(accessKey, {
        profile: selectedProfile,
        displayName: form.displayName,
        email: form.email,
        make: form.make,
        model: form.model,
        colour: form.colour,
        registration: form.registration,
      });
      setMessage(
        result.emailSent
          ? `Driver profile saved and emailed to ${result.profile.email}. Customers see vehicle details on the job day when live tracking starts.`
          : result.emailWarning
            ? `Profile saved, but the confirmation email could not be sent: ${result.emailWarning}`
            : "Driver profile saved. Customers see vehicle details on the job day when live tracking starts.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save driver profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Driver profile</h2>
          <p className="mt-2 text-sm text-white/60">
            Save the driver&apos;s name, email, and vehicle details here. A confirmation email is
            sent to the driver, and customers only see the car details on the job day when live
            tracking is active.
          </p>
        </div>
        {isOwner && profiles.length > 1 && (
          <select
            value={selectedProfile}
            onChange={(event) => setSelectedProfile(event.target.value)}
            className="rounded-xl border border-white/15 bg-navy px-4 py-2.5 text-sm text-white outline-none focus:border-emerald"
          >
            {profiles.map((profile) => (
              <option
                key={profile.profileKey}
                value={profile.profileKey === "owner" ? "owner" : profile.displayName}
              >
                {profile.displayName}
              </option>
            ))}
          </select>
        )}
      </div>

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
            placeholder="e.g. Gary"
          />
        </label>
        <label className="block text-sm text-white/70">
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
            placeholder="driver@example.com"
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
            onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
            placeholder="e.g. E-Class"
          />
        </label>
        <label className="block text-sm text-white/70">
          Colour
          <input
            type="text"
            value={form.colour}
            onChange={(event) => setForm((current) => ({ ...current, colour: event.target.value }))}
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
              setForm((current) => ({ ...current, registration: event.target.value.toUpperCase() }))
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
          {saving ? "Saving…" : "Save profile & email driver"}
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
    </section>
  );
}

function DriverJobCard({
  job,
  driverKey,
  activeToken,
  onSharingChange,
  onRefunded,
  onUpdated,
  onAssignmentUpdated,
  onRefreshJob,
  refreshingJob = false,
  compactTracking = false,
  isOwner = false,
  availableDrivers = [],
}: {
  job: DriverJob;
  driverKey: string;
  activeToken: string | null;
  onSharingChange: (token: string | null) => void;
  onRefunded: (token: string, refundAmount?: string) => void;
  onUpdated: (job: DriverJob) => void;
  onAssignmentUpdated: (job: DriverJob) => void;
  onRefreshJob?: () => void;
  refreshingJob?: boolean;
  compactTracking?: boolean;
  isOwner?: boolean;
  availableDrivers?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
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
  const [assignDriver, setAssignDriver] = useState(availableDrivers[0] ?? "Gary");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [recordedRoute, setRecordedRoute] = useState<MapRoutePoint[]>([]);
  const isActive = activeToken === job.token;
  const mapMarkers = jobMapMarkers(job, { isActiveDriver: isActive, isOwner });
  const isDemoKey = driverKey === DEMO_DRIVER_KEY || driverKey === DEMO_OWNER_KEY;
  const isDemoDriver = driverKey === DEMO_DRIVER_KEY;
  const isRefunded = job.bookingStatus === "refunded";
  const assignmentStatus = job.assignmentStatus ?? "unassigned";
  const isPendingForDriver = !isOwner && assignmentStatus === "pending";
  const isAcceptedAssignment = assignmentStatus === "accepted";
  const isAssigned =
    assignmentStatus === "pending" || assignmentStatus === "accepted" || assignmentStatus === "declined";
  const canRefund = isOwner && Boolean(job.paymentReference?.trim()) && !isDemoKey && !isRefunded;
  const canEdit =
    !isRefunded &&
    (isOwner || isAcceptedAssignment || (isPendingForDriver && job.isAirportPickup));
  const canShare =
    !isOwner && !isRefunded && isAcceptedAssignment && !compactTracking && job.trackingWindow.open;
  const trackingAvailable = !compactTracking && job.trackingWindow.open && !isRefunded;
  const driverSharingLive = Boolean(job.sharingActive && job.driver);
  const showRecordedRoute = isOwner && (job.driverLocationPointCount ?? 0) > 0;
  const showMap =
    mapMarkers.length > 0 || (showRecordedRoute && recordedRoute.length > 0);

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

  const toggleSharing = async () => {
    setBusy(true);
    setError(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      } else {
        if (activeToken) {
          await setDriverSharing(driverKey, activeToken, false);
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

  const copyTrackLink = async () => {
    try {
      await navigator.clipboard.writeText(job.trackUrl);
    } catch {
      setError("Could not copy link");
    }
  };

  const assignToDriver = async () => {
    const driverName = assignDriver.trim();
    if (!driverName) {
      return;
    }

    setAssignBusy(true);
    setError(null);

    try {
      const result = await assignJobToDriver(driverKey, job.token, driverName);
      onAssignmentUpdated(result.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign job");
    } finally {
      setAssignBusy(false);
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

    setRefundBusy(true);
    setRefundMessage(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      }

      const result = await issueBookingRefund({
        ownerKey: driverKey,
        paymentReference,
        trackingToken: job.token,
      });

      if (!result.ok) {
        setRefundMessage(result.error ?? "Refund could not be completed.");
        return;
      }

      setRefundConfirmOpen(false);
      setRefundMessage(
        result.alreadyRefunded
          ? `Already refunded (${result.refundAmount ?? "paid amount"}).`
          : `Refund issued: ${result.refundAmount ?? "paid amount"}. Customer emailed, calendar updated.`,
      );
      onRefunded(job.token, result.refundAmount);
    } catch (err) {
      setRefundMessage(err instanceof Error ? err.message : "Refund could not be completed.");
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <article
      className={`rounded-2xl border p-6 ${
        isRefunded
          ? "border-red-400/20 bg-red-500/[0.04] opacity-90"
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
          {isOwner && job.customerMobile && (
            <p className="mt-2 text-sm text-emerald">{job.customerMobile}</p>
          )}
          {isOwner && job.amountPaidLabel && (
            <p className="mt-1 text-sm text-white/70">Paid: {job.amountPaidLabel}</p>
          )}
          {isOwner && isRefunded && (job.refundAmountLabel || job.amountPaidLabel) && (
            <p className="mt-1 text-sm font-semibold text-red-200">
              Refunded: {job.refundAmountLabel ?? job.amountPaidLabel}
            </p>
          )}
          {isOwner && job.paymentReference && (
            <p className="mt-1 text-xs text-white/40">Ref: {job.paymentReference}</p>
          )}
          {isOwner && job.sharingActive && job.activeDriverName && (
            <p className="mt-2 text-sm font-semibold text-emerald">
              {job.activeDriverName} is sharing live location
            </p>
          )}
          {!isRefunded && (
            <p className="mt-2 text-sm text-white/55">{assignmentSummary(job)}</p>
          )}
          {isOwner && (job.driverLocationPointCount ?? 0) > 0 && (
            <p className="mt-2 text-xs text-white/50">
              {job.driverLocationPointCount} GPS points recorded for audit (retained 1 year)
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
              {job.sharingActive && job.activeDriverName
                ? `${job.activeDriverName} live`
                : job.trackingWindow.open
                  ? "Window open"
                  : compactTracking
                    ? "Upcoming"
                    : "Not yet open"}
            </span>
          </div>
        )}
      </div>

      <DriverFlightPanel job={job} onRefresh={onRefreshJob} refreshing={refreshingJob} />

      <div className="mt-5 flex flex-wrap gap-3">
        {isOwner && !isRefunded && availableDrivers.length > 0 && (
          <>
            <select
              value={assignDriver}
              onChange={(event) => setAssignDriver(event.target.value)}
              className="rounded-xl border border-white/15 bg-navy px-4 py-2.5 text-sm text-white outline-none focus:border-emerald"
            >
              {availableDrivers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={assignBusy}
              onClick={() => void assignToDriver()}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {assignBusy
                ? "Assigning…"
                : assignmentStatus === "pending" || assignmentStatus === "accepted"
                  ? "Reassign job"
                  : "Assign job"}
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

        {isPendingForDriver && (
          <>
            <button
              type="button"
              disabled={assignmentBusy}
              onClick={() => void respondToAssignment("accept")}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {assignmentBusy ? "Saving…" : "Accept job"}
            </button>
            <button
              type="button"
              disabled={assignmentBusy}
              onClick={() => void respondToAssignment("decline")}
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        )}

        {canShare && (
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
        {!isRefunded && (isOwner || isAcceptedAssignment) && (
          <>
            <button
              type="button"
              onClick={() => void copyTrackLink()}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Copy track link
            </button>
            <a
              href={buildWhatsAppTrackLink(job.trackUrl, job.customerName)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Send via WhatsApp
            </a>
          </>
        )}
        {canEdit && !editOpen && (
          <button
            type="button"
            onClick={openEdit}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Edit booking
          </button>
        )}
        {canRefund && !refundConfirmOpen && (
          <button
            type="button"
            disabled={refundBusy}
            onClick={startRefund}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
          >
            Issue refund
          </button>
        )}
      </div>

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
          <p className="text-sm font-semibold text-red-100">Confirm full refund</p>
          <p className="mt-2 text-sm leading-relaxed text-red-100/85">
            This will refund the customer via SumUp, email them a confirmation, mark the job as
            cancelled in your calendar, and show it as refunded on this dashboard. This cannot be
            undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={refundBusy}
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

      {refundMessage && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {refundMessage}
        </p>
      )}

      {isPendingForDriver && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          You&apos;ve been assigned this job. Accept or decline at any time — live tracking opens on
          the day of travel.
        </p>
      )}

      {isActive && !isOwner && (
        <p className="mt-4 text-sm text-emerald">
          Sharing live location for this job. Keep this page open while driving.
        </p>
      )}

      {isOwner && driverSharingLive && (
        <p className="mt-4 text-sm text-emerald">
          {job.activeDriverName ?? "Driver"}&apos;s live location is on the map below.
        </p>
      )}

      {job.customerSharingActive && !job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-white/60">
          Customer has opted in to share location — waiting for their GPS update.
        </p>
      )}

      {job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-emerald">
          Customer location is live on the map below.
        </p>
      )}

      {isOwner && showRecordedRoute && recordedRoute.length > 0 && !driverSharingLive && (
        <p className="mt-4 text-sm text-white/60">
          Recorded driver route shown below — retained for audit purposes.
        </p>
      )}

      {showMap && (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <LiveTrackMap markers={mapMarkers} route={recordedRoute} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </article>
  );
}

export default function DriverPageClient() {
  const [driverKey, setDriverKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<"owner" | "driver" | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<string[]>(["Gary"]);
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [pendingJobs, setPendingJobs] = useState<DriverJob[]>([]);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DashboardView>("today");
  const [selectedDate, setSelectedDate] = useState(() => todayLondonDate());
  const watchIdRef = useRef<number | null>(null);

  const isDemoDriverSession = savedKey === DEMO_DRIVER_KEY;
  const isDemoOwnerSession = savedKey === DEMO_OWNER_KEY;
  const viewRole = isDemoDriverSession ? "driver" : isDemoOwnerSession ? "owner" : sessionRole;
  const viewDriverName = isDemoDriverSession ? DEMO_DRIVER_NAME : driverName;
  const isOwnerView = viewRole === "owner";

  const today = useMemo(() => todayLondonDate(), []);
  const groupedUpcoming = useMemo(() => groupJobsByDate(jobs), [jobs]);
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
  const groupedVisibleUpcoming = useMemo(() => groupJobsByDate(visibleJobs), [visibleJobs]);

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
    [viewRole],
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

  useEffect(() => {
    const stored = window.sessionStorage.getItem(DRIVER_KEY_STORAGE)?.trim();
    if (stored) {
      if (stored === DEMO_DRIVER_KEY) {
        setSessionRole("driver");
        setDriverName(DEMO_DRIVER_NAME);
      } else if (stored === DEMO_OWNER_KEY) {
        setSessionRole("owner");
        setDriverName(null);
        setAvailableDrivers([...DEMO_ROSTER]);
      }
      setSavedKey(stored);
      void loadJobs(stored);
    }
  }, [loadJobs]);

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
    if (!savedKey || !activeToken || !navigator.geolocation || isOwnerView) {
      return;
    }

    const sendPosition = (position: GeolocationPosition) => {
      void postDriverLocation(
        savedKey,
        activeToken,
        position.coords.latitude,
        position.coords.longitude,
      ).catch(() => {
        // Ignore transient GPS upload errors; next tick will retry.
      });
    };

    watchIdRef.current = navigator.geolocation.watchPosition(sendPosition, undefined, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeToken, isOwnerView, savedKey]);

  const unlock = async () => {
    const trimmed = driverKey.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyDriverAccessKey(trimmed);
      if (!result.ok) {
        setError(
          result.message ??
            "That access key was not accepted. Check OWNER_ACCESS_KEY or DRIVER_ACCESS_KEY on the reimagined-octo-meme worker in Cloudflare.",
        );
        return;
      }

      const status = await fetchDriverStatus(trimmed);
      if (trimmed === DEMO_DRIVER_KEY) {
        setSessionRole("driver");
        setDriverName(DEMO_DRIVER_NAME);
      } else if (trimmed === DEMO_OWNER_KEY) {
        setSessionRole("owner");
        setDriverName(null);
        setAvailableDrivers([...DEMO_ROSTER]);
      } else if (status.role) {
        setSessionRole(status.role);
      }
      if (trimmed !== DEMO_DRIVER_KEY && trimmed !== DEMO_OWNER_KEY && status.driverName) {
        setDriverName(status.driverName);
      }
      if (status.role === "owner" && trimmed !== DEMO_OWNER_KEY) {
        if (status.availableDrivers?.length) {
          setAvailableDrivers(status.availableDrivers);
        } else {
          await loadDriverRoster(trimmed);
        }
      }

      window.sessionStorage.setItem(DRIVER_KEY_STORAGE, trimmed);
      setSavedKey(trimmed);
      await loadJobs(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify driver key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {isOwnerView ? "Owner dashboard" : "Driver dashboard"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Bookings</h1>
            <p className="mt-3 text-white/70">
              {isOwnerView ? (
                <>
                  Assign jobs to drivers such as Gary — they must accept before the job appears on
                  their dashboard. Issue refunds, track live location, and manage all bookings here.
                </>
              ) : (
                <>
                  Accept assigned jobs at any time — live tracking starts on the day of travel,
                  from about 2 hours before pickup. For airport pickups, your flight number and
                  live arrival status are shown on each job.
                </>
              )}
            </p>
          </header>

          {!savedKey ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <label htmlFor="driver-key" className="block text-sm font-medium text-white/70">
                Access key
              </label>
              <input
                id="driver-key"
                type="password"
                value={driverKey}
                onChange={(event) => setDriverKey(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="Enter your access key"
              />
              <p className="mt-3 text-sm text-white/55">
                Owners: <span className="text-white/75">OWNER_ACCESS_KEY</span> — preview:{" "}
                <span className="text-white/75">demo-owner-key</span>. Drivers (Gary):{" "}
                <span className="text-white/75">DRIVER_ACCESS_KEY</span> from Cloudflare → Workers →{" "}
                <span className="text-white/75">reimagined-octo-meme</span>. Preview Gary&apos;s view:{" "}
                <span className="text-white/75">demo-driver-key</span>.
              </p>
              {error && (
                <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => void unlock()}
                disabled={loading}
                className="mt-4 rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
              >
                {loading ? "Checking key…" : "Open dashboard"}
              </button>
            </section>
          ) : (
            <>
              <DriverProfilePanel
                accessKey={savedKey}
                isOwner={isOwnerView}
                driverName={viewDriverName}
              />

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
                    window.sessionStorage.removeItem(DRIVER_KEY_STORAGE);
                    setSavedKey(null);
                    setJobs([]);
                    setPendingJobs([]);
                    setActiveToken(null);
                    setSessionRole(null);
                    setDriverName(null);
                    setAvailableDrivers(["Gary"]);
                  }}
                  className="text-sm text-white/50 transition-colors hover:text-white"
                >
                  Sign out
                </button>
              </div>

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

              {!loading && !error && visibleJobs.length === 0 && pendingJobs.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  {viewRole === "driver"
                    ? view === "upcoming"
                      ? "No jobs assigned to you in the next 60 days. When the owner assigns a job, it will appear at the top for you to accept."
                      : "No jobs assigned to you for this date yet."
                    : view === "upcoming"
                      ? "No upcoming paid bookings with tracking in the next 60 days."
                      : "No paid bookings with tracking for this date yet."}
                </div>
              )}

              {pendingJobs.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-2 text-lg font-semibold text-white">
                    {viewRole === "driver" ? "Awaiting your acceptance" : "Awaiting driver acceptance"}
                  </h2>
                  <p className="mb-4 text-sm text-white/60">
                    {viewRole === "driver"
                      ? "You can accept or decline these jobs at any time. Live tracking opens on the day of travel."
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
                        compactTracking={view === "upcoming"}
                        isOwner={isOwnerView}
                        availableDrivers={availableDrivers}
                      />
                    ))}
                  </div>
                </section>
              )}

              {view === "upcoming" ? (
                <div className="space-y-8">
                  {groupedVisibleUpcoming.map((group) => (
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
                  {visibleJobs.map((job) => (
                    <DriverJobCard
                      key={job.token}
                      job={job}
                      driverKey={savedKey}
                      activeToken={activeToken}
                      onSharingChange={setActiveToken}
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
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
