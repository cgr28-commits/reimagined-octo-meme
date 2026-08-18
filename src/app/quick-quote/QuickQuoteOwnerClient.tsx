"use client";

import { useMemo, useState } from "react";
import {
  airportLabel,
  parseQuickQuoteMessage,
  type QuickQuoteAirportCode,
} from "../../../shared/quick-quote-parse";
import { QUICK_QUOTE_MAX_PASSENGERS } from "../../../shared/quick-quote";
import {
  calculateServerQuote,
  createOwnerQuickQuote,
} from "@/lib/quick-quote-api";

const OWNER_KEY_STORAGE = "matni-owner-key";

type Draft = {
  pickupAddress: string;
  dropoffAddress: string;
  airportCode: QuickQuoteAirportCode | "";
  fromAirport: boolean;
  returnJourney: boolean;
  outboundDate: string;
  outboundTime: string;
  returnDate: string;
  returnTime: string;
  passengers: string;
  suitcases: string;
  childSeatRequired: boolean;
  flightNumber: string;
};

const emptyDraft = (): Draft => ({
  pickupAddress: "",
  dropoffAddress: "",
  airportCode: "",
  fromAirport: false,
  returnJourney: false,
  outboundDate: "",
  outboundTime: "",
  returnDate: "",
  returnTime: "",
  passengers: "",
  suitcases: "",
  childSeatRequired: false,
  flightNumber: "",
});

function FieldLabel({
  label,
  flag,
}: {
  label: string;
  flag?: "missing" | "uncertain" | null;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-white/70">{label}</span>
      {flag === "missing" ? (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Missing
        </span>
      ) : null}
      {flag === "uncertain" ? (
        <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-200">
          Check
        </span>
      ) : null}
    </div>
  );
}

export default function QuickQuoteOwnerClient() {
  const [ownerKey, setOwnerKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
  });
  const [keyInput, setKeyInput] = useState("");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [fareLabel, setFareLabel] = useState("");
  const [fareAmount, setFareAmount] = useState<number | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [whatsappReply, setWhatsappReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const flagFor = (name: string): "missing" | "uncertain" | null => {
    if (missing.includes(name)) return "missing";
    if (uncertain.includes(name)) return "uncertain";
    return null;
  };

  const canCalculate = useMemo(() => {
    if (!draft.pickupAddress.trim() || !draft.dropoffAddress.trim()) return false;
    if (!draft.outboundDate || !draft.outboundTime) return false;
    const pax = Number(draft.passengers);
    const bags = Number(draft.suitcases);
    if (!Number.isInteger(pax) || pax < 1 || pax > QUICK_QUOTE_MAX_PASSENGERS) return false;
    if (!Number.isInteger(bags) || bags < 0) return false;
    if (draft.returnJourney && (!draft.returnDate || !draft.returnTime)) return false;
    return true;
  }, [draft]);

  function unlock() {
    const key = keyInput.trim();
    if (!key) {
      setError("Enter your OWNER_ACCESS_KEY.");
      return;
    }
    localStorage.setItem(OWNER_KEY_STORAGE, key);
    setOwnerKey(key);
    setError("");
  }

  function startAgain() {
    setPaste("");
    setDraft(emptyDraft());
    setUncertain([]);
    setMissing([]);
    setFareLabel("");
    setFareAmount(null);
    setVehicleType("");
    setBookingUrl("");
    setWhatsappReply("");
    setError("");
    setNotice("Started again.");
  }

  function applyAirport(code: QuickQuoteAirportCode) {
    setDraft((prev) => {
      const label = airportLabel(code);
      if (prev.fromAirport) {
        return {
          ...prev,
          airportCode: code,
          pickupAddress: label,
          dropoffAddress: prev.dropoffAddress.includes("Airport") ? prev.dropoffAddress : prev.dropoffAddress,
        };
      }
      return {
        ...prev,
        airportCode: code,
        dropoffAddress: label,
      };
    });
    setFareAmount(null);
    setFareLabel("");
    setBookingUrl("");
    setWhatsappReply("");
  }

  function extract() {
    setError("");
    setNotice("");
    setFareAmount(null);
    setFareLabel("");
    setBookingUrl("");
    setWhatsappReply("");
    if (!paste.trim()) {
      setError("Paste a WhatsApp message first.");
      return;
    }
    const parsed = parseQuickQuoteMessage(paste);
    setUncertain(parsed.uncertainFields);
    setMissing(parsed.missingMandatoryForQuote);
    setDraft({
      pickupAddress: parsed.pickupAddress.value ?? "",
      dropoffAddress: parsed.dropoffAddress.value ?? "",
      airportCode: parsed.airportCode.value ?? "",
      fromAirport: parsed.fromAirport.value ?? false,
      returnJourney: parsed.returnJourney.value ?? false,
      outboundDate: parsed.outboundDate.value ?? "",
      outboundTime: parsed.outboundTime.value ?? "",
      returnDate: parsed.returnDate.value ?? "",
      returnTime: parsed.returnTime.value ?? "",
      passengers: parsed.passengers.value != null ? String(parsed.passengers.value) : "",
      suitcases: parsed.suitcases.value != null ? String(parsed.suitcases.value) : "",
      childSeatRequired: parsed.childSeatRequired.value ?? false,
      flightNumber: parsed.flightNumber.value ?? "",
    });
    if (parsed.missingMandatoryForQuote.length || parsed.uncertainFields.length) {
      setNotice(
        "Review highlighted fields before calculating. Uncertain values are never used silently.",
      );
    } else {
      setNotice("Details extracted — check everything looks right, then Calculate Quote.");
    }
  }

  async function calculate() {
    setError("");
    setNotice("");
    setBookingUrl("");
    setWhatsappReply("");
    if (!canCalculate) {
      setError("Fill all required journey fields first (including return date/time when return).");
      return;
    }
    const passengers = Number(draft.passengers);
    if (passengers > QUICK_QUOTE_MAX_PASSENGERS) {
      setError(`Online quotes are limited to ${QUICK_QUOTE_MAX_PASSENGERS} passengers.`);
      return;
    }
    setBusy(true);
    try {
      const result = await calculateServerQuote({
        pickupAddress: draft.pickupAddress.trim(),
        dropoffAddress: draft.dropoffAddress.trim(),
        airportCode: draft.airportCode || null,
        fromAirport: draft.fromAirport,
        returnJourney: draft.returnJourney,
        outboundDate: draft.outboundDate,
        outboundTime: draft.outboundTime,
        returnDate: draft.returnJourney ? draft.returnDate : undefined,
        returnTime: draft.returnJourney ? draft.returnTime : undefined,
        passengers,
        suitcases: Number(draft.suitcases),
        childSeatRequired: draft.childSeatRequired,
        flightNumber: draft.flightNumber.trim() || undefined,
      });
      if (!result.ok) {
        setFareAmount(null);
        setFareLabel("");
        setError(result.message);
        return;
      }
      setFareAmount(result.amount);
      setFareLabel(result.amountLabel);
      setVehicleType(result.vehicleType);
      setNotice("Fixed website fare ready. Generate a booking link when you’re happy.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate fare");
    } finally {
      setBusy(false);
    }
  }

  async function generateLink() {
    setError("");
    setNotice("");
    if (!ownerKey) {
      setError("Unlock with OWNER_ACCESS_KEY first.");
      return;
    }
    if (fareAmount == null) {
      setError("Calculate the quote first.");
      return;
    }
    setBusy(true);
    try {
      const created = await createOwnerQuickQuote(ownerKey, {
        pickupAddress: draft.pickupAddress.trim(),
        dropoffAddress: draft.dropoffAddress.trim(),
        airportCode: draft.airportCode || null,
        fromAirport: draft.fromAirport,
        returnJourney: draft.returnJourney,
        outboundDate: draft.outboundDate,
        outboundTime: draft.outboundTime,
        returnDate: draft.returnJourney ? draft.returnDate : undefined,
        returnTime: draft.returnJourney ? draft.returnTime : undefined,
        passengers: Number(draft.passengers),
        suitcases: Number(draft.suitcases),
        childSeatRequired: draft.childSeatRequired,
        flightNumber: draft.flightNumber.trim() || undefined,
        vehicleType: vehicleType || undefined,
      });
      setBookingUrl(created.bookingUrl);
      setWhatsappReply(created.whatsappReply);
      setFareAmount(created.quote.quotedAmount);
      setFareLabel(created.quote.quotedAmountLabel);
      setNotice("Booking link ready — Copy WhatsApp Reply.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create booking link");
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    if (!whatsappReply) {
      setError("Generate a booking link first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(whatsappReply);
      setNotice("WhatsApp reply copied.");
    } catch {
      setError("Could not copy — select the reply text manually.");
    }
  }

  if (!ownerKey) {
    return (
      <section className="space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-4">
        <p className="text-sm text-white/75">
          Enter your live <span className="text-white">OWNER_ACCESS_KEY</span> (same as the owner
          dashboard). It stays on this phone only.
        </p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="OWNER_ACCESS_KEY"
          className="min-h-12 w-full rounded-xl border border-white/15 bg-navy px-4 text-base text-white placeholder:text-white/35"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button
          type="button"
          onClick={unlock}
          className="min-h-12 w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy"
        >
          Unlock Quick Quote
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <label className="block text-sm font-medium text-white/80">Paste WhatsApp message</label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          placeholder="Paste the customer’s WhatsApp enquiry here…"
          className="w-full rounded-2xl border border-white/15 bg-navy-dark/80 px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={extract}
          className="min-h-12 w-full rounded-xl bg-white px-4 text-base font-semibold text-navy"
        >
          Extract journey details
        </button>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/60 p-4">
        <p className="text-sm font-semibold text-white">Airport shortcuts</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["BFS", "Belfast International"],
              ["BHD", "Belfast City"],
              ["DUB", "Dublin Airport"],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => applyAirport(code)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                draft.airportCode === code
                  ? "border-emerald bg-emerald/15 text-emerald"
                  : "border-white/15 text-white/85"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({ ...d, fromAirport: true }));
              setFareAmount(null);
            }}
            className={`min-h-11 rounded-xl border text-sm ${
              draft.fromAirport ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            From airport
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({ ...d, fromAirport: false }));
              setFareAmount(null);
            }}
            className={`min-h-11 rounded-xl border text-sm ${
              !draft.fromAirport ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            To airport
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/60 p-4">
        <p className="text-sm font-semibold text-white">Journey details</p>

        <div>
          <FieldLabel label="Pickup address" flag={flagFor("pickupAddress")} />
          <input
            value={draft.pickupAddress}
            onChange={(e) => {
              setDraft({ ...draft, pickupAddress: e.target.value });
              setFareAmount(null);
            }}
            className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          />
        </div>
        <div>
          <FieldLabel label="Destination address" flag={flagFor("dropoffAddress")} />
          <input
            value={draft.dropoffAddress}
            onChange={(e) => {
              setDraft({ ...draft, dropoffAddress: e.target.value });
              setFareAmount(null);
            }}
            className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft({ ...draft, returnJourney: false, returnDate: "", returnTime: "" });
              setFareAmount(null);
            }}
            className={`min-h-11 rounded-xl border text-sm ${
              !draft.returnJourney ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            One-way
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({ ...draft, returnJourney: true });
              setFareAmount(null);
            }}
            className={`min-h-11 rounded-xl border text-sm ${
              draft.returnJourney ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            Return
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Outbound date" flag={flagFor("outboundDate")} />
            <input
              type="date"
              value={draft.outboundDate}
              onChange={(e) => {
                setDraft({ ...draft, outboundDate: e.target.value });
                setFareAmount(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </div>
          <div>
            <FieldLabel label="Outbound time" flag={flagFor("outboundTime")} />
            <input
              type="time"
              value={draft.outboundTime}
              onChange={(e) => {
                setDraft({ ...draft, outboundTime: e.target.value });
                setFareAmount(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </div>
        </div>

        {draft.returnJourney ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel
                label="Return date"
                flag={!draft.returnDate ? "missing" : flagFor("returnDate")}
              />
              <input
                type="date"
                value={draft.returnDate}
                onChange={(e) => {
                  setDraft({ ...draft, returnDate: e.target.value });
                  setFareAmount(null);
                }}
                className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
            </div>
            <div>
              <FieldLabel
                label="Return time"
                flag={!draft.returnTime ? "missing" : flagFor("returnTime")}
              />
              <input
                type="time"
                value={draft.returnTime}
                onChange={(e) => {
                  setDraft({ ...draft, returnTime: e.target.value });
                  setFareAmount(null);
                }}
                className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label={`Passengers (max ${QUICK_QUOTE_MAX_PASSENGERS})`} flag={flagFor("passengers")} />
            <input
              inputMode="numeric"
              value={draft.passengers}
              onChange={(e) => {
                setDraft({ ...draft, passengers: e.target.value });
                setFareAmount(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </div>
          <div>
            <FieldLabel label="Luggage" flag={flagFor("suitcases")} />
            <input
              inputMode="numeric"
              value={draft.suitcases}
              onChange={(e) => {
                setDraft({ ...draft, suitcases: e.target.value });
                setFareAmount(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </div>
        </div>

        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm text-white/80">
          <input
            type="checkbox"
            checked={draft.childSeatRequired}
            onChange={(e) => setDraft({ ...draft, childSeatRequired: e.target.checked })}
            className="h-4 w-4 rounded border-white/30"
          />
          Child seat required
        </label>

        <div>
          <FieldLabel label="Flight number" flag={flagFor("flightNumber")} />
          <input
            value={draft.flightNumber}
            onChange={(e) => setDraft({ ...draft, flightNumber: e.target.value })}
            placeholder="Optional"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          />
        </div>
      </section>

      {fareAmount != null ? (
        <section className="rounded-2xl border border-emerald/40 bg-emerald/10 px-4 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Fixed fare</p>
          <p className="mt-1 font-display text-4xl text-white">{fareLabel}</p>
          {vehicleType ? <p className="mt-1 text-sm text-white/60">{vehicleType}</p> : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald/90">{notice}</p> : null}

      <div className="grid gap-2">
        <button
          type="button"
          disabled={busy || !canCalculate}
          onClick={() => void calculate()}
          className="min-h-12 rounded-xl bg-emerald px-4 text-base font-semibold text-navy disabled:opacity-40"
        >
          {busy ? "Working…" : "Calculate Quote"}
        </button>
        <button
          type="button"
          disabled={busy || fareAmount == null}
          onClick={() => void generateLink()}
          className="min-h-12 rounded-xl bg-white px-4 text-base font-semibold text-navy disabled:opacity-40"
        >
          Generate Booking Link
        </button>
        <button
          type="button"
          disabled={!whatsappReply}
          onClick={() => void copyReply()}
          className="min-h-12 rounded-xl border border-white/20 px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Copy WhatsApp Reply
        </button>
        <button
          type="button"
          onClick={startAgain}
          className="min-h-11 rounded-xl px-4 text-sm font-medium text-white/60 underline-offset-2 hover:underline"
        >
          Start Again
        </button>
      </div>

      {whatsappReply ? (
        <section className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Reply preview</p>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
            {whatsappReply}
          </pre>
          {bookingUrl ? (
            <p className="break-all text-xs text-emerald/80">{bookingUrl}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
