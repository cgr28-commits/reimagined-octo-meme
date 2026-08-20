"use client";

import { useMemo, useState } from "react";
import AddressInput from "@/components/AddressInput";
import {
  airportLabel,
  cleanExtractedText,
  countFieldValue,
  parseAirportCode,
  parseQuickQuoteMessage,
  type QuickQuoteAirportCode,
} from "../../../shared/quick-quote-parse";
import { QUICK_QUOTE_MAX_PASSENGERS } from "../../../shared/quick-quote";
import {
  calculateServerQuote,
  createOwnerQuickQuote,
} from "@/lib/quick-quote-api";
import {
  emptySelectedPlace,
  isPlaceSelected,
  placeDisplayText,
  quickSelectToPlace,
  type SelectedPlace,
} from "@/lib/selected-place";

const OWNER_KEY_STORAGE = "matni-owner-key";

const fieldClass =
  "quote-text-input min-h-12 rounded-xl border border-white/15 bg-navy px-3 text-base text-white";

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
    <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate text-xs font-medium text-white/70">{label}</span>
      {flag === "missing" ? (
        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Missing
        </span>
      ) : null}
      {flag === "uncertain" ? (
        <span className="shrink-0 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-200">
          Check
        </span>
      ) : null}
    </div>
  );
}

function isAirportAddress(value: string): boolean {
  return Boolean(parseAirportCode(value));
}

function resolveJourneyAddresses(
  pickupPlace: SelectedPlace,
  dropoffPlace: SelectedPlace,
  draft: Draft,
): { pickupAddress: string; dropoffAddress: string } {
  const pickupAddress = isPlaceSelected(pickupPlace)
    ? placeDisplayText(pickupPlace)
    : draft.pickupAddress.trim();
  const dropoffAddress = isPlaceSelected(dropoffPlace)
    ? placeDisplayText(dropoffPlace)
    : draft.dropoffAddress.trim();
  return { pickupAddress, dropoffAddress };
}

export default function QuickQuoteOwnerClient() {
  const [ownerKey, setOwnerKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
  });
  const [keyInput, setKeyInput] = useState("");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace>(() => emptySelectedPlace());
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace>(() => emptySelectedPlace());
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [fareLabel, setFareLabel] = useState("");
  const [fareAmount, setFareAmount] = useState<number | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [whatsappReply, setWhatsappReply] = useState("");
  const [flightTimeHint, setFlightTimeHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pickupSuggestToken, setPickupSuggestToken] = useState(0);
  const [dropoffSuggestToken, setDropoffSuggestToken] = useState(0);

  const flagFor = (name: string): "missing" | "uncertain" | null => {
    if (missing.includes(name)) return "missing";
    if (uncertain.includes(name)) return "uncertain";
    return null;
  };

  const canCalculate = useMemo(() => {
    const { pickupAddress, dropoffAddress } = resolveJourneyAddresses(
      pickupPlace,
      dropoffPlace,
      draft,
    );
    if (!pickupAddress || !dropoffAddress) return false;
    // Date/time optional for fare calculation — customer must set before payment.
    const pax = Number(draft.passengers);
    const bags = Number(draft.suitcases);
    if (!Number.isInteger(pax) || pax < 1 || pax > QUICK_QUOTE_MAX_PASSENGERS) return false;
    if (!Number.isInteger(bags) || bags < 0) return false;
    if (
      draft.returnJourney &&
      ((draft.returnDate && !draft.returnTime) || (!draft.returnDate && draft.returnTime))
    ) {
      return false;
    }
    return true;
  }, [draft, pickupPlace, dropoffPlace]);

  function clearQuoteOutputs() {
    setFareAmount(null);
    setFareLabel("");
    setVehicleType("");
    setBookingUrl("");
    setWhatsappReply("");
  }

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
    setPickupPlace(emptySelectedPlace());
    setDropoffPlace(emptySelectedPlace());
    setUncertain([]);
    setMissing([]);
    clearQuoteOutputs();
    setFlightTimeHint("");
    setError("");
    setNotice("Started again.");
  }

  function applyAirport(code: QuickQuoteAirportCode) {
    const place = quickSelectToPlace(code);
    if (!place) return;
    const label = placeDisplayText(place) || airportLabel(code);
    const fromAirport = draft.fromAirport;
    if (fromAirport) {
      setPickupPlace(place);
      setDropoffPlace((prev) => (isAirportAddress(draft.dropoffAddress) ? emptySelectedPlace() : prev));
      setDraft((prev) => ({
        ...prev,
        airportCode: code,
        pickupAddress: label,
        dropoffAddress: isAirportAddress(prev.dropoffAddress) ? "" : prev.dropoffAddress,
      }));
    } else {
      setDropoffPlace(place);
      setPickupPlace((prev) => (isAirportAddress(draft.pickupAddress) ? emptySelectedPlace() : prev));
      setDraft((prev) => ({
        ...prev,
        airportCode: code,
        dropoffAddress: label,
        pickupAddress: isAirportAddress(prev.pickupAddress) ? "" : prev.pickupAddress,
      }));
    }
    clearQuoteOutputs();
  }

  function setDirection(fromAirport: boolean) {
    const code = draft.airportCode;
    if (!code) {
      setDraft((prev) => ({ ...prev, fromAirport }));
      clearQuoteOutputs();
      return;
    }
    const place = quickSelectToPlace(code);
    if (!place) {
      setDraft((prev) => ({ ...prev, fromAirport }));
      clearQuoteOutputs();
      return;
    }
    const airportText = placeDisplayText(place) || airportLabel(code);

    if (fromAirport) {
      const customerSide =
        !isAirportAddress(draft.dropoffAddress) && draft.dropoffAddress.trim()
          ? draft.dropoffAddress
          : !isAirportAddress(draft.pickupAddress) && draft.pickupAddress.trim()
            ? draft.pickupAddress
            : "";
      setPickupPlace(place);
      setDropoffPlace(emptySelectedPlace());
      setDraft((prev) => ({
        ...prev,
        fromAirport: true,
        pickupAddress: airportText,
        dropoffAddress: customerSide,
      }));
    } else {
      const customerSide =
        !isAirportAddress(draft.pickupAddress) && draft.pickupAddress.trim()
          ? draft.pickupAddress
          : !isAirportAddress(draft.dropoffAddress) && draft.dropoffAddress.trim()
            ? draft.dropoffAddress
            : "";
      setDropoffPlace(place);
      setPickupPlace(emptySelectedPlace());
      setDraft((prev) => ({
        ...prev,
        fromAirport: false,
        dropoffAddress: airportText,
        pickupAddress: customerSide,
      }));
    }
    clearQuoteOutputs();
  }

  function extract() {
    setError("");
    setNotice("");
    clearQuoteOutputs();
    setFlightTimeHint("");
    if (!paste.trim()) {
      setError("Paste a WhatsApp message first.");
      return;
    }
    const parsed = parseQuickQuoteMessage(paste);
    const passengers = countFieldValue(parsed.passengers.value);
    const suitcases = countFieldValue(parsed.suitcases.value);
    const airportCode = parsed.airportCode.value ?? "";
    const fromAirport = parsed.fromAirport.value ?? false;
    let nextPickup = cleanExtractedText(parsed.pickupAddress.value ?? "");
    let nextDropoff = cleanExtractedText(parsed.dropoffAddress.value ?? "");
    let nextPickupPlace = emptySelectedPlace();
    let nextDropoffPlace = emptySelectedPlace();
    const flightNumber =
      parsed.flightNumber.value && !/^BT\d/i.test(parsed.flightNumber.value)
        ? parsed.flightNumber.value
        : "";

    if (airportCode === "BFS" || airportCode === "BHD" || airportCode === "DUB") {
      const airportPlace = quickSelectToPlace(airportCode);
      if (airportPlace) {
        const airportText = placeDisplayText(airportPlace) || airportLabel(airportCode);
        if (fromAirport) {
          nextPickupPlace = airportPlace;
          nextPickup = airportText;
        } else {
          nextDropoffPlace = airportPlace;
          nextDropoff = airportText;
        }
      }
    }

    const nextDraft: Draft = {
      pickupAddress: nextPickup,
      dropoffAddress: nextDropoff,
      airportCode,
      fromAirport,
      returnJourney: parsed.returnJourney.value ?? false,
      outboundDate: parsed.outboundDate.value ?? "",
      outboundTime: parsed.outboundTime.value ?? "",
      returnDate: parsed.returnDate.value ?? "",
      returnTime: parsed.returnTime.value ?? "",
      passengers,
      suitcases,
      childSeatRequired: parsed.childSeatRequired.value ?? false,
      flightNumber,
    };

    setPickupPlace(nextPickupPlace);
    setDropoffPlace(nextDropoffPlace);
    setDraft(nextDraft);

    // Kick Places search for unconfirmed (non-airport) addresses — one-tap confirm.
    if (!isPlaceSelected(nextPickupPlace) && nextPickup.trim().length >= 3) {
      setPickupSuggestToken((n) => n + 1);
    }
    if (!isPlaceSelected(nextDropoffPlace) && nextDropoff.trim().length >= 3) {
      setDropoffSuggestToken((n) => n + 1);
    }

    // Missing badges from what actually landed in React state — not parser alone.
    const nextMissing: string[] = [];
    if (!nextDraft.pickupAddress.trim()) nextMissing.push("pickupAddress");
    if (!nextDraft.dropoffAddress.trim()) nextMissing.push("dropoffAddress");
    if (!nextDraft.outboundDate) nextMissing.push("outboundDate");
    if (!nextDraft.outboundTime) nextMissing.push("outboundTime");
    if (!nextDraft.passengers.trim()) nextMissing.push("passengers");
    if (!nextDraft.suitcases.trim()) nextMissing.push("suitcases");
    if (nextDraft.returnJourney) {
      if (!nextDraft.returnDate) nextMissing.push("returnDate");
      if (!nextDraft.returnTime) nextMissing.push("returnTime");
    }
    setUncertain(parsed.uncertainFields);
    setMissing(nextMissing);
    setFlightTimeHint(parsed.flightTime.value ?? "");

    if (nextMissing.length || parsed.uncertainFields.length) {
      setNotice(
        "Review highlighted fields. Tap a suggested address to confirm, then Calculate Quote.",
      );
    } else if (!isPlaceSelected(nextPickupPlace) || !isPlaceSelected(nextDropoffPlace)) {
      setNotice(
        "Details extracted — tap the suggested address below to confirm, then Calculate Quote.",
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
    const { pickupAddress, dropoffAddress } = resolveJourneyAddresses(
      pickupPlace,
      dropoffPlace,
      draft,
    );
    if (!isPlaceSelected(pickupPlace) && !isAirportAddress(pickupAddress)) {
      setError("Select the pickup address from the suggestions list.");
      return;
    }
    if (!isPlaceSelected(dropoffPlace) && !isAirportAddress(dropoffAddress)) {
      setError("Select the destination address from the suggestions list.");
      return;
    }
    setBusy(true);
    try {
      const result = await calculateServerQuote({
        pickupAddress,
        dropoffAddress,
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
        pickupLat: pickupPlace.lat ?? undefined,
        pickupLng: pickupPlace.lng ?? undefined,
        dropoffLat: dropoffPlace.lat ?? undefined,
        dropoffLng: dropoffPlace.lng ?? undefined,
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
    const { pickupAddress, dropoffAddress } = resolveJourneyAddresses(
      pickupPlace,
      dropoffPlace,
      draft,
    );
    setBusy(true);
    try {
      const created = await createOwnerQuickQuote(ownerKey, {
        pickupAddress,
        dropoffAddress,
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
      <section className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-4">
        <p className="text-sm text-white/75">
          Enter your live <span className="text-white">OWNER_ACCESS_KEY</span> (same as the owner
          dashboard). It stays on this phone only.
        </p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="OWNER_ACCESS_KEY"
          className={fieldClass}
        />
        {error ? <p className="break-words text-sm text-red-300">{error}</p> : null}
        <button
          type="button"
          onClick={unlock}
          className="min-h-12 w-full max-w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy"
        >
          Unlock Quick Quote
        </button>
      </section>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
      <section className="min-w-0 space-y-3">
        <label className="block text-sm font-medium text-white/80">Paste WhatsApp message</label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          placeholder="Paste the customer’s WhatsApp enquiry here…"
          className="quote-text-input w-full max-w-full rounded-2xl border border-white/15 bg-navy-dark/80 px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={extract}
          className="min-h-12 w-full max-w-full rounded-xl bg-white px-4 text-base font-semibold text-navy"
        >
          Extract journey details
        </button>
      </section>

      <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-white/10 bg-navy-dark/60 p-4">
        <p className="text-sm font-semibold text-white">Airport shortcuts</p>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
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
              className={`min-h-11 min-w-0 rounded-xl border px-3 text-sm font-medium ${
                draft.airportCode === code
                  ? "border-emerald bg-emerald/15 text-emerald"
                  : "border-white/15 text-white/85"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection(true)}
            className={`min-h-11 min-w-0 rounded-xl border text-sm ${
              draft.fromAirport ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            From airport
          </button>
          <button
            type="button"
            onClick={() => setDirection(false)}
            className={`min-h-11 min-w-0 rounded-xl border text-sm ${
              !draft.fromAirport ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            To airport
          </button>
        </div>
      </section>

      <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-white/10 bg-navy-dark/60 p-4">
        <p className="text-sm font-semibold text-white">Journey details</p>

        <div className="min-w-0">
          <FieldLabel label="Pickup address" flag={flagFor("pickupAddress")} />
          <AddressInput
            id="qq-pickup"
            name="qq-pickup"
            hideLabel
            label="Pickup address"
            value={draft.pickupAddress}
            onChange={(value) => {
              setDraft((d) => ({ ...d, pickupAddress: value }));
              setPickupPlace(emptySelectedPlace());
              clearQuoteOutputs();
            }}
            onSelectPlace={(place) => {
              setPickupPlace(place);
              setDraft((d) => ({ ...d, pickupAddress: placeDisplayText(place) }));
              clearQuoteOutputs();
              setMissing((m) => m.filter((x) => x !== "pickupAddress"));
            }}
            confirmedPlace={isPlaceSelected(pickupPlace) ? pickupPlace : null}
            requireSuggestion={false}
            disableAutoScroll
            autoSuggestToken={pickupSuggestToken}
            autoConfirmExactMatch
            placeholder="Type address — then tap a suggestion"
            helperText="Suggestions open after extract — tap once to confirm"
            airportCode={draft.airportCode || ""}
            className="min-w-0"
          />
        </div>
        <div className="min-w-0">
          <FieldLabel label="Destination address" flag={flagFor("dropoffAddress")} />
          <AddressInput
            id="qq-dropoff"
            name="qq-dropoff"
            hideLabel
            label="Destination address"
            value={draft.dropoffAddress}
            onChange={(value) => {
              setDraft((d) => ({ ...d, dropoffAddress: value }));
              setDropoffPlace(emptySelectedPlace());
              clearQuoteOutputs();
            }}
            onSelectPlace={(place) => {
              setDropoffPlace(place);
              setDraft((d) => ({ ...d, dropoffAddress: placeDisplayText(place) }));
              clearQuoteOutputs();
              setMissing((m) => m.filter((x) => x !== "dropoffAddress"));
            }}
            confirmedPlace={isPlaceSelected(dropoffPlace) ? dropoffPlace : null}
            requireSuggestion={false}
            disableAutoScroll
            autoSuggestToken={dropoffSuggestToken}
            autoConfirmExactMatch
            placeholder="Type address — then tap a suggestion"
            helperText="Suggestions open after extract — tap once to confirm"
            airportCode={draft.airportCode || ""}
            className="min-w-0"
          />
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({ ...d, returnJourney: false, returnDate: "", returnTime: "" }));
              clearQuoteOutputs();
            }}
            className={`min-h-11 min-w-0 rounded-xl border text-sm ${
              !draft.returnJourney ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            One-way
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({ ...d, returnJourney: true }));
              clearQuoteOutputs();
            }}
            className={`min-h-11 min-w-0 rounded-xl border text-sm ${
              draft.returnJourney ? "border-emerald text-emerald" : "border-white/15 text-white/80"
            }`}
          >
            Return
          </button>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel label="Outbound date" flag={flagFor("outboundDate")} />
            <input
              type="date"
              value={draft.outboundDate}
              onChange={(e) => {
                setDraft((d) => ({ ...d, outboundDate: e.target.value }));
                clearQuoteOutputs();
                setMissing((m) => m.filter((x) => x !== "outboundDate"));
              }}
              className={fieldClass}
            />
          </div>
          <div className="min-w-0">
            <FieldLabel label="Outbound time" flag={flagFor("outboundTime")} />
            <input
              type="time"
              value={draft.outboundTime}
              onChange={(e) => {
                setDraft((d) => ({ ...d, outboundTime: e.target.value }));
                clearQuoteOutputs();
                setMissing((m) => m.filter((x) => x !== "outboundTime"));
              }}
              className={fieldClass}
            />
          </div>
        </div>

        {draft.returnJourney ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel
                label="Return date"
                flag={!draft.returnDate ? "missing" : flagFor("returnDate")}
              />
              <input
                type="date"
                value={draft.returnDate}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, returnDate: e.target.value }));
                  clearQuoteOutputs();
                }}
                className={fieldClass}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel
                label="Return time"
                flag={!draft.returnTime ? "missing" : flagFor("returnTime")}
              />
              <input
                type="time"
                value={draft.returnTime}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, returnTime: e.target.value }));
                  clearQuoteOutputs();
                }}
                className={fieldClass}
              />
            </div>
          </div>
        ) : null}

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel
              label={`Passengers (max ${QUICK_QUOTE_MAX_PASSENGERS})`}
              flag={flagFor("passengers")}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={draft.passengers}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
                setDraft((d) => ({ ...d, passengers: next }));
                clearQuoteOutputs();
                if (next.trim()) {
                  setMissing((m) => m.filter((x) => x !== "passengers"));
                }
              }}
              className={fieldClass}
            />
          </div>
          <div className="min-w-0">
            <FieldLabel label="Luggage" flag={flagFor("suitcases")} />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={draft.suitcases}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
                setDraft((d) => ({ ...d, suitcases: next }));
                clearQuoteOutputs();
                if (next.trim()) {
                  setMissing((m) => m.filter((x) => x !== "suitcases"));
                }
              }}
              className={fieldClass}
            />
          </div>
        </div>

        <label className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm text-white/80">
          <input
            type="checkbox"
            checked={draft.childSeatRequired}
            onChange={(e) => setDraft((d) => ({ ...d, childSeatRequired: e.target.checked }))}
            className="h-4 w-4 shrink-0 rounded border-white/30"
          />
          Child seat required
        </label>

        <div className="min-w-0">
          <FieldLabel label="Flight number" flag={flagFor("flightNumber")} />
          <input
            value={draft.flightNumber}
            onChange={(e) => setDraft((d) => ({ ...d, flightNumber: e.target.value }))}
            placeholder="Optional"
            className={fieldClass}
          />
        </div>
        {flightTimeHint ? (
          <p className="break-words text-xs text-white/55">
            Flight time mentioned in message: <span className="text-white/85">{flightTimeHint}</span>{" "}
            (pickup time is separate — confirm above).
          </p>
        ) : null}
      </section>

      {fareAmount != null ? (
        <section className="min-w-0 overflow-hidden rounded-2xl border border-emerald/40 bg-emerald/10 px-4 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Fixed fare</p>
          <p className="mt-1 break-words font-display text-4xl text-white">{fareLabel}</p>
          {vehicleType ? <p className="mt-1 break-words text-sm text-white/60">{vehicleType}</p> : null}
        </section>
      ) : null}

      {error ? <p className="break-words text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="break-words text-sm text-emerald/90">{notice}</p> : null}

      <div className="grid min-w-0 gap-2">
        <button
          type="button"
          disabled={busy || !canCalculate}
          onClick={() => void calculate()}
          className="min-h-12 w-full max-w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy disabled:opacity-40"
        >
          {busy ? "Working…" : "Calculate Quote"}
        </button>
        <button
          type="button"
          disabled={busy || fareAmount == null}
          onClick={() => void generateLink()}
          className="min-h-12 w-full max-w-full rounded-xl bg-white px-4 text-base font-semibold text-navy disabled:opacity-40"
        >
          Generate Booking Link
        </button>
        <button
          type="button"
          disabled={!whatsappReply}
          onClick={() => void copyReply()}
          className="min-h-12 w-full max-w-full rounded-xl border border-white/20 px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Copy WhatsApp Reply
        </button>
        <button
          type="button"
          onClick={startAgain}
          className="min-h-11 w-full max-w-full rounded-xl px-4 text-sm font-medium text-white/60 underline-offset-2 hover:underline"
        >
          Start Again
        </button>
      </div>

      {whatsappReply ? (
        <section className="min-w-0 space-y-2 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Reply preview</p>
          <pre className="max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
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
