"use client";

import { useState } from "react";
import { Anchor, Check, Ship } from "lucide-react";
import { portSummaryLine, type PortRegion, type PublicPort } from "../../shared/ports";

type Direction = "from" | "to";

type Props = {
  ports: PublicPort[];
  /** Place ids currently in the pickup / drop-off boxes, to show the selected tile. */
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  onPick: (port: PublicPort, direction: Direction) => void;
  notice?: string;
};

const REGIONS: ReadonlyArray<{ id: PortRegion; label: string }> = [
  { id: "NI", label: "Northern Ireland" },
  { id: "DUBLIN", label: "Dublin" },
];

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 rounded-[12px] p-1" style={{ backgroundColor: "#e8edf3" }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            data-port-segment={option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-10 rounded-[9px] px-2 text-[13px] font-bold leading-tight transition-colors ${
              selected ? "bg-[#071c38] text-white shadow-sm" : "text-[#071c38]"
            }`}
            style={selected ? { WebkitTextFillColor: "#ffffff" } : { WebkitTextFillColor: "#071c38", color: "#071c38" }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cruise & ferry port tiles, built into the quote tool (owner, 25 Nov 2026). Tapping a tile
 * fills the pickup ("From port") or drop-off ("To port") with a confirmed place, exactly as
 * if it had been picked from the address suggestions. Only one region's tiles show at once.
 */
export default function PortPicker({ ports, pickupPlaceId, dropoffPlaceId, onPick, notice }: Props) {
  const [direction, setDirection] = useState<Direction>("from");
  const [region, setRegion] = useState<PortRegion>("NI");

  const regionsWithPorts = REGIONS.filter((item) => ports.some((port) => port.region === item.id));
  if (!ports.length) return null;
  const activeRegion = regionsWithPorts.some((item) => item.id === region) ? region : regionsWithPorts[0]?.id ?? "NI";
  const visible = ports.filter((port) => port.region === activeRegion);
  const chosenId = direction === "from" ? pickupPlaceId : dropoffPlaceId;
  const chosen = ports.find((port) => port.placeId === chosenId) ?? null;

  return (
    <section
      data-port-picker
      aria-label="Cruise and ferry ports"
      className="mt-1 rounded-[14px] border border-[#071c38]/12 p-2.5 sm:p-3"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="flex items-center gap-2 pb-2">
        <Anchor size={15} strokeWidth={2.4} className="text-emerald" aria-hidden="true" />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#071c38]/75">Cruise &amp; ferry ports</h3>
      </div>
      <div className="grid gap-2">
        <Segment
          label="Journey direction"
          value={direction}
          options={[
            { id: "from", label: "From port" },
            { id: "to", label: "To port" },
          ]}
          onChange={setDirection}
        />
        {regionsWithPorts.length > 1 ? (
          <Segment label="Region" value={activeRegion} options={regionsWithPorts} onChange={setRegion} />
        ) : null}
        <div role="group" aria-label={direction === "from" ? "Pick up from port" : "Drop off at port"} className="grid gap-2 sm:grid-cols-2">
          {visible.map((port) => {
            const selected = port.placeId === chosenId;
            const line = portSummaryLine(port);
            return (
              <button
                key={port.id}
                type="button"
                aria-pressed={selected}
                data-port-tile={port.id}
                data-port-selected={selected ? "" : undefined}
                onClick={() => onPick(port, direction)}
                className={`flex min-h-[60px] items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-emerald bg-emerald/10 ring-1 ring-emerald"
                    : "border-[#071c38]/15 bg-white hover:border-emerald/60"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    selected ? "bg-emerald text-white" : "bg-[#071c38]/[0.07] text-[#071c38]"
                  }`}
                  aria-hidden="true"
                >
                  {selected ? <Check size={18} strokeWidth={3} /> : <Ship size={18} strokeWidth={2.2} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-snug text-[#071c38]" style={{ WebkitTextFillColor: "#071c38" }}>
                    {port.name}
                  </span>
                  {line ? (
                    <span className="mt-0.5 block text-[12px] leading-snug text-[#071c38]/70" style={{ WebkitTextFillColor: "rgba(7,28,56,0.7)" }}>
                      {line}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {notice ? (
          <p role="alert" data-port-notice className="rounded-[10px] bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800">
            {notice}
          </p>
        ) : null}
        {chosen ? (
          <p data-port-instructions className="text-[12px] leading-snug text-[#071c38]/75" style={{ WebkitTextFillColor: "rgba(7,28,56,0.75)" }}>
            {chosen.pickupInstructions}
          </p>
        ) : null}
      </div>
    </section>
  );
}
