"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_PORTS,
  MAX_CUSTOM_PORTS,
  portHasVerifiedLocation,
  resolvePorts,
  type PortEntry,
  type PortOverride,
  type PortSettings,
} from "../../shared/ports";
import type { BookingSettings } from "@/lib/short-notice-api";
import { updatePortSettings } from "@/lib/short-notice-api";

type Props = {
  ownerKey: string;
  settings: BookingSettings | null;
  onSaved: (settings: BookingSettings) => void;
};

const EDITABLE: ReadonlyArray<keyof PortOverride> = [
  "name",
  "operator",
  "sailsTo",
  "terminal",
  "placeId",
  "formattedAddress",
  "postalCode",
  "lat",
  "lng",
  "pickupInstructions",
  "berthConfirmation",
  "active",
];

/** Only the fields the owner changed from the built-in port are stored. */
function toSettings(draft: PortEntry[]): PortSettings {
  const overrides: Record<string, PortOverride> = {};
  const custom: PortEntry[] = [];
  for (const port of draft) {
    if (port.custom) {
      custom.push(port);
      continue;
    }
    const base = DEFAULT_PORTS.find((item) => item.id === port.id);
    if (!base) continue;
    const diff: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (port[key] !== base[key]) diff[key] = port[key];
    }
    if (Object.keys(diff).length) overrides[port.id] = diff as PortOverride;
  }
  return { overrides, custom };
}

const inputClass =
  "mt-1 w-full rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-white/70">
      {label}
      <input className={inputClass} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** Owner control for the cruise & ferry ports shown in the quote tool (25 Nov 2026). */
export default function OwnerPortSettings({ ownerKey, settings, onSaved }: Props) {
  const initial = useMemo(() => resolvePorts(settings?.ports), [settings?.ports]);
  const [draft, setDraft] = useState<PortEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const ports = draft ?? initial;

  function change(id: string, patch: Partial<PortEntry>) {
    setMessage("");
    setDraft((ports) => (ports ?? initial).map((port) => (port.id === id ? { ...port, ...patch } : port)));
  }

  function addPort() {
    const customCount = ports.filter((port) => port.custom).length;
    if (customCount >= MAX_CUSTOM_PORTS) return;
    const id = `custom-new-${Date.now()}`;
    const entry: PortEntry = {
      id,
      name: "",
      region: "NI",
      kind: "cruise",
      operator: null,
      sailsTo: null,
      terminal: null,
      placeId: `port-${id}`,
      formattedAddress: "",
      postalCode: null,
      lat: null,
      lng: null,
      pickupInstructions: "We confirm the exact meeting point before you travel.",
      berthConfirmation: true,
      active: false,
      note: "Added by the owner.",
      custom: true,
    };
    setDraft([...ports, entry]);
    setOpenId(id);
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await updatePortSettings(ownerKey, toSettings(ports.filter((port) => !port.custom || port.name.trim())));
      onSaved(saved);
      setDraft(null);
      setMessage("Saved. The quote tool now shows the active ports below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the ports");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] p-3 sm:p-4" data-owner-port-settings>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Cruise &amp; ferry ports</p>
      <h3 className="mt-1 text-lg font-bold text-white">Port terminals</h3>
      <p className="mt-1 text-sm text-white/65">
        Switch ports on or off, edit names, addresses, locations and pickup instructions, or add a new port. A port can
        only be switched on once it has an address and latitude/longitude of the passenger pickup point.
      </p>
      <ul className="mt-3 space-y-2">
        {ports.map((port) => {
          const ready = portHasVerifiedLocation(port);
          const open = openId === port.id;
          return (
            <li key={port.id} className="rounded-lg border border-white/12 bg-white/[0.04] p-3" data-owner-port={port.id}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(open ? null : port.id)}>
                  <span className="block break-words text-sm font-bold text-white">{port.name || "New port"}</span>
                  <span className="block text-xs text-white/55">
                    {port.region === "DUBLIN" ? "Dublin" : "Northern Ireland"} · {port.kind === "ferry" ? "Ferry" : "Cruise"}
                    {ready ? "" : " · location needed"}
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={port.active}
                  aria-label={`${port.name || "Port"} active`}
                  disabled={!ready && !port.active}
                  onClick={() => change(port.id, { active: !port.active })}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
                    port.active ? "bg-emerald" : "bg-white/20"
                  }`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${port.active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {open ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Field label="Name" value={port.name} onChange={(value) => change(port.id, { name: value })} />
                  <Field label="Operator" value={port.operator ?? ""} onChange={(value) => change(port.id, { operator: value || null })} />
                  <Field label="Sails to" value={port.sailsTo ?? ""} onChange={(value) => change(port.id, { sailsTo: value || null })} />
                  <Field label="Terminal" value={port.terminal ?? ""} onChange={(value) => change(port.id, { terminal: value || null })} />
                  <div className="sm:col-span-2">
                    <Field label="Address shown to customers" value={port.formattedAddress} onChange={(value) => change(port.id, { formattedAddress: value })} />
                  </div>
                  <Field label="Postcode / Eircode" value={port.postalCode ?? ""} onChange={(value) => change(port.id, { postalCode: value || null })} />
                  <Field label="Google place id (optional)" value={port.placeId} onChange={(value) => change(port.id, { placeId: value })} />
                  <Field label="Latitude" value={port.lat == null ? "" : String(port.lat)} onChange={(value) => change(port.id, { lat: value.trim() === "" ? null : Number(value) })} placeholder="54.6368" />
                  <Field label="Longitude" value={port.lng == null ? "" : String(port.lng)} onChange={(value) => change(port.id, { lng: value.trim() === "" ? null : Number(value) })} placeholder="-5.8829" />
                  {port.custom ? (
                    <>
                      <label className="block text-xs font-semibold text-white/70">
                        Region
                        <select className={inputClass} value={port.region} onChange={(event) => change(port.id, { region: event.target.value === "DUBLIN" ? "DUBLIN" : "NI" })}>
                          <option value="NI">Northern Ireland</option>
                          <option value="DUBLIN">Dublin</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold text-white/70">
                        Type
                        <select className={inputClass} value={port.kind} onChange={(event) => change(port.id, { kind: event.target.value === "ferry" ? "ferry" : "cruise" })}>
                          <option value="cruise">Cruise port</option>
                          <option value="ferry">Ferry terminal</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                  <label className="block text-xs font-semibold text-white/70 sm:col-span-2">
                    Pickup instructions (shown to customer and driver)
                    <textarea className={inputClass} rows={3} value={port.pickupInstructions} onChange={(event) => change(port.id, { pickupInstructions: event.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-white/70 sm:col-span-2">
                    <input type="checkbox" checked={port.berthConfirmation} onChange={(event) => change(port.id, { berthConfirmation: event.target.checked })} />
                    Meeting point varies — confirm the berth with the customer before travel
                  </label>
                  {port.note ? <p className="text-xs text-white/50 sm:col-span-2">Note: {port.note}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={addPort} className="rounded-lg border border-white/25 px-3 py-2 text-sm font-semibold text-white">
          Add a port
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || draft == null}
          className="rounded-lg bg-emerald px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save ports"}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-emerald">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
