"use client";

import { useEffect, useMemo, useState } from "react";
import {
  assignJobToDriver,
  fetchDriverVehicle,
  fetchDriverVehicleProfiles,
  fetchOwnerAccountProfile,
  type DriverJob,
} from "@/lib/tracking-api";
import { PRIMARY_DRIVER_LABEL } from "../../shared/paid-booking-record";
import type { DriverAssignmentHistoryEntry } from "../../shared/tracking";
import { formatUkInstant } from "../../shared/uk-time";

export type AssignProfileOption = {
  profileKey: string;
  displayName: string;
  complete?: boolean;
};

type AssignFormState = {
  driverFirstName: string;
  driverEmail: string;
  driverMobile: string;
  driverCarMake: string;
  driverCarModel: string;
  driverCarColour: string;
  driverReg: string;
  driverPayAmount: string;
};

const EMPTY_FORM: AssignFormState = {
  driverFirstName: "",
  driverEmail: "",
  driverMobile: "",
  driverCarMake: "",
  driverCarModel: "",
  driverCarColour: "",
  driverReg: "",
  driverPayAmount: "",
};

function isOwnerProfileKey(key: string): boolean {
  return key.trim().toLowerCase() === "owner";
}

function profileSubtitle(profile: AssignProfileOption): string {
  if (isOwnerProfileKey(profile.profileKey)) {
    return PRIMARY_DRIVER_LABEL;
  }
  return profile.complete === false ? "Saved driver (incomplete)" : "Saved driver";
}

function historyActionLabel(entry: DriverAssignmentHistoryEntry): string {
  switch (entry.action) {
    case "reassigned":
      return "Reassigned";
    case "deassigned":
      return "Deassigned";
    default:
      return "Assigned";
  }
}

type OwnerAssignDriverPanelProps = {
  ownerKey: string;
  trackingToken: string;
  mode: "assign" | "reassign";
  currentDriverName?: string | null;
  assignmentHistory?: DriverAssignmentHistoryEntry[];
  onClose: () => void;
  onAssigned: (job: DriverJob) => void;
};

export default function OwnerAssignDriverPanel({
  ownerKey,
  trackingToken,
  mode,
  currentDriverName,
  assignmentHistory,
  onClose,
  onAssigned,
}: OwnerAssignDriverPanelProps) {
  const [profiles, setProfiles] = useState<AssignProfileOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState<AssignFormState>(EMPTY_FORM);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((entry) => entry.profileKey === selectedKey) ?? null,
    [profiles, selectedKey],
  );

  const ctaLabel = useMemo(() => {
    const name = form.driverFirstName.trim() || selectedProfile?.displayName || "driver";
    if (busy) return "Sending…";
    return mode === "reassign" ? `Reassign to ${name}` : `Assign ${name}`;
  }, [busy, form.driverFirstName, mode, selectedProfile?.displayName]);

  useEffect(() => {
    let cancelled = false;
    setLoadingProfiles(true);

    void fetchDriverVehicleProfiles(ownerKey)
      .then((next) => {
        if (cancelled) return;
        setProfiles(next);
        // Prefer currently assigned driver when reopening; otherwise first profile.
        const currentKey = (currentDriverName ?? "").trim().toLowerCase().replace(/\s+/g, "-");
        const match =
          next.find((entry) => entry.profileKey === currentKey) ||
          next.find(
            (entry) =>
              entry.displayName.trim().toLowerCase() ===
              (currentDriverName ?? "").trim().toLowerCase(),
          ) ||
          next[0];
        if (match) {
          setSelectedKey(match.profileKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
          setError("Could not load saved driver profiles.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false);
      });

    return () => {
      cancelled = true;
    };
    // Only reload when the panel mounts / token or owner changes — not on every selection.
  }, [ownerKey, trackingToken, currentDriverName]);

  useEffect(() => {
    if (!selectedKey) return;

    let cancelled = false;
    setPrefillBusy(true);

    void (async () => {
      try {
        let profile = await fetchDriverVehicle(ownerKey, selectedKey);

        if ((!profile || !profile.email) && isOwnerProfileKey(selectedKey)) {
          const owner = await fetchOwnerAccountProfile(ownerKey);
          if (owner.profile) {
            profile = {
              profileKey: "owner",
              displayName: owner.profile.displayName,
              email: owner.profile.email,
              mobile: owner.profile.mobile,
              make: owner.profile.make,
              model: owner.profile.model,
              colour: owner.profile.colour,
              registration: owner.profile.registration,
              updatedAt: owner.profile.updatedAt,
            };
          }
        }

        if (cancelled || !profile) return;

        setForm((prev) => ({
          ...prev,
          driverFirstName: profile.displayName || prev.driverFirstName,
          driverEmail: profile.email || prev.driverEmail,
          driverMobile: profile.mobile || prev.driverMobile,
          driverCarMake: profile.make || prev.driverCarMake,
          driverCarModel: profile.model || prev.driverCarModel,
          driverCarColour: profile.colour || prev.driverCarColour,
          driverReg: profile.registration || prev.driverReg,
        }));
      } catch {
        /* keep manual values */
      } finally {
        if (!cancelled) setPrefillBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerKey, selectedKey]);

  const submit = async () => {
    const driverFirstName = form.driverFirstName.trim();
    const driverEmail = form.driverEmail.trim();
    const driverMobile = form.driverMobile.trim();
    const driverPayAmount = form.driverPayAmount.trim();

    if (!driverFirstName) {
      setError("Enter the driver’s first name");
      return;
    }
    if (!driverEmail || !driverEmail.includes("@")) {
      setError("Enter a valid driver email");
      return;
    }
    if (!driverMobile) {
      setError("Enter the driver’s mobile number");
      return;
    }
    if (!driverPayAmount) {
      setError("Enter how much you are paying the driver for this journey");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await assignJobToDriver(ownerKey, trackingToken, {
        driverFirstName,
        driverEmail,
        driverMobile,
        driverCarMake: form.driverCarMake,
        driverCarModel: form.driverCarModel,
        driverCarColour: form.driverCarColour,
        driverReg: form.driverReg,
        driverPayAmount,
      });

      onAssigned({
        ...result.job,
        assignedDriverName: driverFirstName,
        assignedDriverMobile: driverMobile,
        assignedDriverCarMake: form.driverCarMake.trim() || result.job.assignedDriverCarMake,
        assignedDriverCarModel: form.driverCarModel.trim() || result.job.assignedDriverCarModel,
        assignedDriverCarColour:
          form.driverCarColour.trim() || result.job.assignedDriverCarColour,
        assignedDriverReg: form.driverReg.trim() || result.job.assignedDriverReg,
        driverPayAmount,
      });

      setMessage(
        result.emailed === false
          ? "Driver assigned. Email may not have been sent — check worker email settings."
          : `Assignment emailed to ${driverEmail}. A copy was sent to you.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald/30 bg-emerald/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {mode === "reassign" ? "Reassign driver" : "Assign driver"}
          </p>
          <p className="mt-1 text-xs text-white/55">
            Tap a saved driver to prefill their details, then confirm. You can still edit fields
            below if needed.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/30"
        >
          Close
        </button>
      </div>

      {loadingProfiles ? (
        <p className="text-sm text-white/50">Loading saved drivers…</p>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-amber-100">
          No saved driver profiles yet. Enter details below, or save a driver under Additional
          drivers first.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Saved drivers
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {profiles.map((profile) => {
              const selected = profile.profileKey === selectedKey;
              return (
                <button
                  key={profile.profileKey}
                  type="button"
                  onClick={() => setSelectedKey(profile.profileKey)}
                  className={`min-h-[3.25rem] rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-emerald bg-emerald/20 text-white"
                      : "border-white/15 bg-navy/60 text-white/90 hover:border-white/30"
                  }`}
                >
                  <span className="block text-base font-bold leading-tight">
                    {profile.displayName}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/55">
                    {profileSubtitle(profile)}
                  </span>
                </button>
              );
            })}
          </div>
          {prefillBusy ? (
            <p className="mt-2 text-xs text-white/45">Loading profile details…</p>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["driverFirstName", "Driver first name"],
            ["driverEmail", "Driver email"],
            ["driverMobile", "Driver mobile"],
            ["driverCarMake", "Car make"],
            ["driverCarModel", "Car model"],
            ["driverCarColour", "Car colour"],
            ["driverReg", "Registration"],
            ["driverPayAmount", "Amount to pay driver (not customer price)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-xs text-white/50">
            {label}
            <input
              value={form[key]}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, [key]: event.target.value }))
              }
              placeholder={
                key === "driverPayAmount"
                  ? "e.g. £80"
                  : key === "driverMobile"
                    ? "e.g. 07700 900123"
                    : undefined
              }
              className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-emerald"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || !form.driverFirstName.trim()}
        onClick={() => void submit()}
        className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60 sm:w-auto"
      >
        {ctaLabel}
      </button>

      {message ? (
        <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm text-emerald-light">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {assignmentHistory && assignmentHistory.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-navy/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Assignment history
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-white/65">
            {assignmentHistory.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <span className="font-semibold text-white/85">{historyActionLabel(entry)}</span>
                {entry.fromDriverName ? ` from ${entry.fromDriverName}` : ""}
                {entry.toDriverName ? ` to ${entry.toDriverName}` : ""}
                {" · "}
                {formatUkInstant(entry.at, { withZoneLabel: true, includeYear: false })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
