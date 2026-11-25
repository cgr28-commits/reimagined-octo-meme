"use client";

import { useEffect, useRef, useState } from "react";
import { Anchor } from "lucide-react";
import { portTileLabel, type PortRegion, type PublicPort } from "../../shared/ports";

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
  { id: "NI", label: "N. Ireland" },
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
    <div role="group" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-0.5 rounded-[10px] p-0.5" style={{ backgroundColor: "#e8edf3" }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            data-port-segment={option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-10 rounded-[8px] px-1.5 text-[12.5px] font-bold leading-tight transition-colors ${
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
 * Cruise & ferry port picker, built into the quote tool (owner, 25 Nov 2026; compacted the
 * same day). Compact two-column chips styled like the airport quick-picks. Once a terminal
 * is chosen the picker folds into a one-line summary with a Change button. Long pickup
 * instructions are NOT shown here: they appear at booking details and in confirmations.
 */
export default function PortPicker({ ports, pickupPlaceId, dropoffPlaceId, onPick, notice }: Props) {
  const [direction, setDirection] = useState<Direction>("from");
  const [region, setRegion] = useState<PortRegion>("NI");
  const [reopened, setReopened] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const firstTileRef = useRef<HTMLDivElement>(null);

  const pickupPort = ports.find((port) => port.placeId === pickupPlaceId) ?? null;
  const dropoffPort = ports.find((port) => port.placeId === dropoffPlaceId) ?? null;
  const hasChosen = Boolean(pickupPort || dropoffPort);
  // Folded once a terminal is chosen, unless the customer reopened it or there is a notice to read.
  const collapsed = hasChosen && !reopened && !notice;

  // A fresh choice folds the picker again; clearing both boxes unfolds it.
  const chosenKey = `${pickupPort?.id ?? ""}|${dropoffPort?.id ?? ""}`;
  const lastKey = useRef(chosenKey);
  useEffect(() => {
    if (lastKey.current !== chosenKey) {
      lastKey.current = chosenKey;
      setReopened(false);
    }
  }, [chosenKey]);

  if (!ports.length) return null;
  const regionsWithPorts = REGIONS.filter((item) => ports.some((port) => port.region === item.id));
  const activeRegion = regionsWithPorts.some((item) => item.id === region) ? region : regionsWithPorts[0]?.id ?? "NI";
  const visible = ports.filter((port) => port.region === activeRegion);
  const chosenId = direction === "from" ? pickupPlaceId : dropoffPlaceId;

  if (collapsed) {
    return (
      <section
        data-port-picker
        data-port-picker-collapsed
        aria-label="Selected cruise or ferry terminal"
        className="flex min-h-11 items-center gap-2 rounded-[10px] border px-2.5 py-1"
        style={{ backgroundColor: "#e8fde1", borderColor: "#2fc30a" }}
      >
        <Anchor size={14} strokeWidth={2.4} aria-hidden="true" style={{ color: "#071c38" }} className="shrink-0" />
        <div className="min-w-0 flex-1 text-[12.5px] font-bold leading-tight" style={{ color: "#071c38", WebkitTextFillColor: "#071c38" }}>
          {pickupPort ? (
            <p className="truncate" data-port-summary="from">
              <span className="font-semibold opacity-70">From </span>
              {portTileLabel(pickupPort)}
            </p>
          ) : null}
          {dropoffPort ? (
            <p className="truncate" data-port-summary="to">
              <span className="font-semibold opacity-70">To </span>
              {portTileLabel(dropoffPort)}
            </p>
          ) : null}
        </div>
        <button
          ref={changeRef}
          type="button"
          data-port-change
          onClick={() => {
            setReopened(true);
            if (!pickupPort && dropoffPort) setDirection("to");
            else setDirection("from");
          }}
          className="min-h-10 shrink-0 rounded-[8px] border bg-white px-3 text-[12.5px] font-bold"
          style={{ borderColor: "rgba(7,28,56,0.25)", color: "#071c38", WebkitTextFillColor: "#071c38" }}
        >
          Change
        </button>
      </section>
    );
  }

  return (
    <section
      data-port-picker
      aria-label="Cruise and ferry ports"
      className="rounded-[12px] border border-[#071c38]/12 p-2"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="flex items-center gap-1.5 pb-1.5">
        <Anchor size={13} strokeWidth={2.4} className="text-emerald" aria-hidden="true" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#071c38]/75">Cruise &amp; ferry ports</h3>
        {hasChosen ? (
          <button
            type="button"
            data-port-done
            onClick={() => setReopened(false)}
            className="ml-auto min-h-8 px-1.5 text-[12px] font-bold underline"
            style={{ color: "#071c38", WebkitTextFillColor: "#071c38" }}
          >
            Done
          </button>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <div className="grid grid-cols-2 gap-1.5">
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
        </div>
        <div
          ref={firstTileRef}
          role="group"
          aria-label={direction === "from" ? "Pick up from port" : "Drop off at port"}
          className="grid grid-cols-2 gap-1.5 min-[1200px]:grid-cols-4"
        >
          {visible.map((port) => {
            const selected = port.placeId === chosenId;
            return (
              <button
                key={port.id}
                type="button"
                aria-pressed={selected}
                data-port-tile={port.id}
                data-port-selected={selected ? "" : undefined}
                onClick={() => onPick(port, direction)}
              >
                {portTileLabel(port)}
              </button>
            );
          })}
        </div>
        {notice ? (
          <p role="alert" data-port-notice className="rounded-[8px] bg-red-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-red-800">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
