"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddressInput from "@/components/AddressInput";
import FiniteOptionSelect, {
  ONLINE_PASSENGER_OPTIONS,
  PERSONAL_QUOTE_SUITCASE_OPTIONS,
} from "@/components/FiniteOptionSelect";
import ExpressDropOffSelector from "@/components/ExpressDropOffSelector";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/data";
import { formatQuote } from "@/lib/quote";
import {
  createOwnerPersonalQuote,
  deactivateOwnerPersonalQuote,
  fetchOwnerPersonalQuotesAndCustomers,
  type PersonalQuoteOwnerView,
  type PersonalQuoteRecentCustomer,
} from "@/lib/personal-quote-api";
import {
  consumePersonalQuotePrefill,
  type PersonalQuotePrefill,
} from "@/lib/personal-quote-prefill";
import {
  emptySelectedPlace,
  isPlaceSelected,
  placeDisplayText,
  type SelectedPlace,
} from "@/lib/selected-place";
import { selectVehicleForParty } from "@/lib/vehicle-selection";
import { calculateServerQuote } from "@/lib/quick-quote-api";
import { resolveAirportTransferIntent } from "../../shared/airport-transfer-intent";
import {
  composeFareWithExpressDropOff,
  expressDropOffBreakdownLabel,
  resolveExpressDropOff,
  toExpressDropOffPersistedFields,
} from "../../shared/express-drop-off";
import {
  applyPersonalQuoteDiscount,
  buildPersonalQuoteWhatsAppMessage,
  formatPersonalQuoteAmount,
  PERSONAL_QUOTE_MAX_DISCOUNT_PERCENT,
  PERSONAL_QUOTE_MAX_PASSENGERS,
  PERSONAL_QUOTE_MIN_PASSENGERS,
  type PersonalQuoteDiscountType,
} from "../../shared/personal-quote";


type OwnerPersonalQuotesPanelProps = {
  ownerKey: string;
};

const OWNER_PQ_VEHICLES = VEHICLE_TYPES.filter(
  (v) => !v.toLowerCase().includes("minibus") && !v.includes("5–7"),
) as VehicleType[];

function defaultExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export default function OwnerPersonalQuotesPanel({ ownerKey }: OwnerPersonalQuotesPanelProps) {
  const [quotes, setQuotes] = useState<PersonalQuoteOwnerView[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<PersonalQuoteRecentCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculatingFare, setCalculatingFare] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fareHint, setFareHint] = useState("");
  const [lastCreated, setLastCreated] = useState<PersonalQuoteOwnerView | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  /** Public quote tool price for the journey below (whole booking, before discount). */
  const [standardWebsiteAmount, setStandardWebsiteAmount] = useState("");
  const [discountType, setDiscountType] = useState<PersonalQuoteDiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [expiresOn, setExpiresOn] = useState(defaultExpiry);
  const [singleUse, setSingleUse] = useState(true);
  const [notes, setNotes] = useState("");
  const [pickupLabel, setPickupLabel] = useState("");
  const [dropoffLabel, setDropoffLabel] = useState("");
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace>(() => emptySelectedPlace());
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace>(() => emptySelectedPlace());
  const [passengers, setPassengers] = useState(2);
  const [suitcases, setSuitcases] = useState(2);
  const [vehicle, setVehicle] = useState<VehicleType>(OWNER_PQ_VEHICLES[0] ?? VEHICLE_TYPES[0]);
  const [journeyDate, setJourneyDate] = useState("");
  const [journeyTime, setJourneyTime] = useState("10:00");
  const [expressDropOffSelected, setExpressDropOffSelected] = useState(true);
  const [expressRemovalAck, setExpressRemovalAck] = useState(false);
  const [expressAckRequired, setExpressAckRequired] = useState(false);

  const journeyIntent = useMemo(() => {
    const pickup = pickupLabel.trim() || placeDisplayText(pickupPlace);
    const dropoff = dropoffLabel.trim() || placeDisplayText(dropoffPlace);
    return resolveAirportTransferIntent({
      airportCode: null,
      fromAirport: null,
      pickupAddress: pickup,
      dropoffAddress: dropoff,
    });
  }, [pickupLabel, dropoffLabel, pickupPlace, dropoffPlace]);

  const expressSelection = useMemo(
    () =>
      resolveExpressDropOff({
        airportCode: journeyIntent?.airportCode ?? null,
        fromAirport: journeyIntent?.fromAirport ?? false,
        returnJourney: false,
        selected: expressDropOffSelected,
      }),
    [journeyIntent, expressDropOffSelected],
  );

  const expressPersisted = useMemo(
    () => toExpressDropOffPersistedFields(expressSelection),
    [expressSelection],
  );

  // The website price only belongs to the journey it was calculated for.
  const journeyKey = JSON.stringify([
    pickupLabel.trim() || placeDisplayText(pickupPlace),
    dropoffLabel.trim() || placeDisplayText(dropoffPlace),
    passengers,
    suitcases,
    vehicle,
    journeyDate,
    journeyTime,
    returnJourney,
    returnJourney ? returnDate : "",
    returnJourney ? returnTime : "",
  ]);
  const [pricedJourneyKey, setPricedJourneyKey] = useState("");
  const priceIsCurrent = pricedJourneyKey === journeyKey && standardWebsiteAmount.trim() !== "";

  /** Website price → discount → what the customer pays (same maths as checkout). */
  const pricePreview = useMemo(() => {
    if (!priceIsCurrent) return null;
    const standard = parseMoney(standardWebsiteAmount);
    if (standard == null || standard < 1) return null;
    return applyPersonalQuoteDiscount(standard, {
      discountType,
      discountValue: parseMoney(discountValue) ?? 0,
    });
  }, [priceIsCurrent, standardWebsiteAmount, discountType, discountValue]);

  const customerTotalPreview = useMemo(() => {
    if (!pricePreview) return null;
    return composeFareWithExpressDropOff({
      transferFareGbp: pricePreview.transferGbp,
      expressDropOffFeeGbp: expressPersisted.expressDropOffFee,
    });
  }, [pricePreview, expressPersisted.expressDropOffFee]);


  useEffect(() => {
    setExpressDropOffSelected(true);
    setExpressRemovalAck(false);
    setExpressAckRequired(false);
  }, [journeyIntent?.airportCode, journeyIntent?.fromAirport]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchOwnerPersonalQuotesAndCustomers(ownerKey);
      setQuotes(list.quotes);
      setRecentCustomers(list.recentCustomers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load personal quotes");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = selectVehicleForParty(passengers, suitcases);
    if (OWNER_PQ_VEHICLES.includes(next)) {
      setVehicle(next);
    } else {
      setVehicle(OWNER_PQ_VEHICLES[0] ?? VEHICLE_TYPES[0]);
    }
  }, [passengers, suitcases]);

  function currentAirport() {
    const airportCodeRaw = String(journeyIntent?.airportCode ?? "").trim().toUpperCase();
    return airportCodeRaw === "BFS" || airportCodeRaw === "BHD" || airportCodeRaw === "DUB" || airportCodeRaw === "LDY"
      ? airportCodeRaw
      : null;
  }

  async function handleCalculateWebsiteFare() {
    setCalculatingFare(true);
    setFareHint("");
    setError("");
    try {
      const pickup = pickupLabel.trim() || placeDisplayText(pickupPlace);
      const dropoff = dropoffLabel.trim() || placeDisplayText(dropoffPlace);
      if (!pickup || !dropoff) {
        throw new Error("Enter pickup and destination, then calculate the website price.");
      }
      if (returnJourney && (!returnDate || !returnTime)) {
        throw new Error("Enter the return date and time, or switch to one way.");
      }
      const airportCode = currentAirport();
      // Exactly what the public quote card sends — addresses and place IDs only,
      // so the server measures the route and applies the live pricing settings.
      const result = await calculateServerQuote(
        {
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          ...(pickupPlace.placeId ? { pickupPlaceId: pickupPlace.placeId } : {}),
          ...(dropoffPlace.placeId ? { dropoffPlaceId: dropoffPlace.placeId } : {}),
          airportCode: airportCode === "LDY" ? null : airportCode,
          fromAirport: Boolean(journeyIntent?.fromAirport),
          returnJourney,
          outboundDate: journeyDate.trim(),
          outboundTime: journeyTime.trim(),
          returnDate: returnJourney ? returnDate : "",
          returnTime: returnJourney ? returnTime : "",
          passengers,
          suitcases,
          vehicleType: vehicle,
        },
        ownerKey,
      );
      if (!result.ok) {
        throw new Error(result.message || "Could not calculate the website price for that journey.");
      }
      const websitePrice = Math.round(result.amount * 100) / 100;
      setStandardWebsiteAmount(String(websitePrice));
      setPricedJourneyKey(journeyKey);
      setFareHint(
        `Website price ${formatQuote(websitePrice)} (${returnJourney ? "return" : "one way"}) — exactly what the public quote tool shows for this journey.`,
      );
    } catch (err) {
      setFareHint("");
      setError(err instanceof Error ? err.message : "Could not calculate website fare");
    } finally {
      setCalculatingFare(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    setLastCreated(null);
    try {
      if (
        expressSelection.eligible &&
        !expressDropOffSelected &&
        !expressRemovalAck
      ) {
        setExpressAckRequired(true);
        throw new Error(
          "Please confirm you understand the free drop-off area before continuing without Express Drop-Off.",
        );
      }
      if (!pricePreview) {
        throw new Error("Calculate the website price first.");
      }
      const airportCode = currentAirport();
      const quote = await createOwnerPersonalQuote(ownerKey, {
        customerName,
        customerEmail: customerEmail.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        // The server re-prices the journey itself; these are only a fallback.
        agreedAmount: pricePreview.transferGbp,
        standardWebsiteAmount: pricePreview.websiteTransferGbp,
        pricingMode: "live-discount",
        discountType,
        discountValue: parseMoney(discountValue) ?? 0,
        journey: {
          ...(pickupPlace.placeId ? { pickupPlaceId: pickupPlace.placeId } : {}),
          ...(dropoffPlace.placeId ? { dropoffPlaceId: dropoffPlace.placeId } : {}),
          passengers,
          suitcases,
          vehicle,
          returnJourney,
          ...(journeyDate.trim() ? { tripDate: journeyDate.trim() } : {}),
          ...(journeyTime.trim() ? { tripTime: journeyTime.trim() } : {}),
          ...(returnJourney && returnDate ? { returnDate } : {}),
          ...(returnJourney && returnTime ? { returnTime } : {}),
        },
        expiresOn,
        singleUse,
        notes: notes.trim() || undefined,
        pickupLabel: pickupLabel.trim() || undefined,
        dropoffLabel: dropoffLabel.trim() || undefined,
        expressDropOffSelected: expressPersisted.expressDropOffSelected,
        expressDropOffFee: expressPersisted.expressDropOffFee,
        expressDropOffAirport: expressPersisted.expressDropOffAirport,
        airportCode,
        fromAirport: Boolean(journeyIntent?.fromAirport),
      });
      setLastCreated(quote);
      setMessage(`Personal quote created: ${quote.code} · ${quote.amountLabel}`);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerMobile("");
      setStandardWebsiteAmount("");
      setDiscountType("amount");
      setDiscountValue("");
      setReturnJourney(false);
      setReturnDate("");
      setReturnTime("");
      setNotes("");
      setPickupLabel("");
      setDropoffLabel("");
      setPickupPlace(emptySelectedPlace());
      setDropoffPlace(emptySelectedPlace());
      setPassengers(2);
      setSuitcases(2);
      setJourneyDate("");
      setJourneyTime("10:00");
      setFareHint("");
      setExpiresOn(defaultExpiry());
      setSingleUse(true);
      setExpressDropOffSelected(true);
      setExpressRemovalAck(false);
      setExpressAckRequired(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create personal quote");
    } finally {
      setSaving(false);
    }
  }

  /** "Quote again": fill the form from a past quote or booking; owner recalculates. */
  function applyPrefill(prefill: PersonalQuotePrefill) {
    setCustomerName(prefill.customerName ?? "");
    setCustomerEmail(prefill.customerEmail ?? "");
    setCustomerMobile(prefill.customerMobile ?? "");
    setPickupLabel(prefill.pickupLabel ?? "");
    setDropoffLabel(prefill.dropoffLabel ?? "");
    setPickupPlace(
      prefill.journey?.pickupPlaceId
        ? { ...emptySelectedPlace(), placeId: prefill.journey.pickupPlaceId, formattedAddress: prefill.pickupLabel ?? "" }
        : emptySelectedPlace(),
    );
    setDropoffPlace(
      prefill.journey?.dropoffPlaceId
        ? { ...emptySelectedPlace(), placeId: prefill.journey.dropoffPlaceId, formattedAddress: prefill.dropoffLabel ?? "" }
        : emptySelectedPlace(),
    );
    const journey = prefill.journey;
    if (journey) {
      setPassengers(
        Math.min(PERSONAL_QUOTE_MAX_PASSENGERS, Math.max(PERSONAL_QUOTE_MIN_PASSENGERS, Number(journey.passengers) || 1)),
      );
      setSuitcases(Math.min(PERSONAL_QUOTE_SUITCASE_OPTIONS[PERSONAL_QUOTE_SUITCASE_OPTIONS.length - 1], Math.max(0, Number(journey.suitcases) || 0)));
      if (OWNER_PQ_VEHICLES.includes(journey.vehicle as VehicleType)) setVehicle(journey.vehicle as VehicleType);
      setReturnJourney(Boolean(journey.returnJourney));
    }
    // Dates are left for the new trip; the owner sets them before calculating.
    setJourneyDate("");
    setReturnDate("");
    setReturnTime("");
    setStandardWebsiteAmount("");
    setDiscountValue("");
    setError("");
    setMessage(`Details filled in for ${prefill.customerName || "this customer"} — set the new date and time, then calculate.`);
    if (typeof window !== "undefined") {
      document.getElementById("owner-pq-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Arriving from "Quote again" on a booking: fill the form once.
  useEffect(() => {
    const prefill = consumePersonalQuotePrefill();
    if (prefill) applyPrefill(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRecentCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = term
      ? recentCustomers.filter((c) =>
          [c.customerName, c.customerEmail, c.customerMobile, c.pickupLabel, c.dropoffLabel]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : recentCustomers;
    return list.slice(0, 8);
  }, [recentCustomers, customerSearch]);

  async function handleDeactivate(code: string) {
    setError("");
    setMessage("");
    try {
      await deactivateOwnerPersonalQuote(ownerKey, code);
      setMessage(`Deactivated ${code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate quote");
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(label);
    } catch {
      setMessage(text);
    }
  }

  function customerLinkFor(quote: PersonalQuoteOwnerView): string | null {
    if (quote.customerLink) return quote.customerLink;
    return null;
  }

  /**
   * Match OwnerShortNoticePanel / OwnerBookingCalendar overflow guards.
   * Native date inputs have a large min-content width; without min-w-0 they can
   * force the 2-col grid wider than the viewport and nudge the whole dashboard sideways.
   */
  const fieldClass =
    "box-border mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-base text-white outline-none focus:border-emerald [color-scheme:dark]";

  return (
    <section className="mb-8 w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex w-full min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">Personal quotes</h2>
          <p className="mt-1 max-w-xl break-words text-sm text-white/65">
            Create an agreed fare, optionally apply a discount, and send a private customer link.
            SumUp always charges the server-authorised amount — customers never enter an MQ code.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {recentCustomers.length > 0 ? (
        <div className="mt-4 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-sm font-semibold text-white">Quote a previous customer again</p>
          <input
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className={fieldClass}
            placeholder="Search name, email, mobile or address"
            aria-label="Search previous customers"
          />
          <ul className="mt-2 space-y-1">
            {filteredRecentCustomers.map((customer) => (
              <li key={`${customer.customerName}-${customer.lastQuotedAt}`}>
                <button
                  type="button"
                  onClick={() => applyPrefill(customer)}
                  className="w-full min-w-0 rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/5"
                >
                  <span className="font-semibold text-white">{customer.customerName}</span>
                  {customer.customerMobile || customer.customerEmail ? (
                    <span className="text-white/55"> · {customer.customerMobile || customer.customerEmail}</span>
                  ) : null}
                  {customer.pickupLabel || customer.dropoffLabel ? (
                    <span className="block break-words text-xs text-white/45">
                      {[customer.pickupLabel, customer.dropoffLabel].filter(Boolean).join(" → ")}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        id="owner-pq-form"
        onSubmit={(e) => void handleCreate(e)}
        className="mt-4 grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <label className="block min-w-0 text-sm text-white/80">
          Customer name
          <input
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={fieldClass}
            placeholder="John Smith"
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Customer email (optional)
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className={fieldClass}
            placeholder="optional"
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80 sm:col-span-2">
          Customer mobile (optional)
          <input
            type="tel"
            value={customerMobile}
            onChange={(e) => setCustomerMobile(e.target.value)}
            className={fieldClass}
            placeholder="07…"
          />
        </label>

        <div className="min-w-0 sm:col-span-2">
          <AddressInput
            id="owner-pq-pickup"
            name="owner-pq-pickup"
            label="Pickup"
            value={pickupLabel}
            onChange={(value) => {
              setPickupLabel(value);
              setPickupPlace(emptySelectedPlace());
              setFareHint("");
            }}
            onSelectPlace={(place) => {
              setPickupPlace(place);
              setPickupLabel(placeDisplayText(place));
              setFareHint("");
            }}
            confirmedPlace={isPlaceSelected(pickupPlace) ? pickupPlace : null}
            requireSuggestion={false}
            placeholder="Start typing an address or airport"
            airportCode="A2A"
          />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <AddressInput
            id="owner-pq-dropoff"
            name="owner-pq-dropoff"
            label="Destination"
            value={dropoffLabel}
            onChange={(value) => {
              setDropoffLabel(value);
              setDropoffPlace(emptySelectedPlace());
              setFareHint("");
            }}
            onSelectPlace={(place) => {
              setDropoffPlace(place);
              setDropoffLabel(placeDisplayText(place));
              setFareHint("");
            }}
            confirmedPlace={isPlaceSelected(dropoffPlace) ? dropoffPlace : null}
            requireSuggestion={false}
            placeholder="Start typing an address or airport"
            airportCode="A2A"
          />
        </div>
        <label className="block min-w-0 text-sm text-white/80">
          Passengers
          <FiniteOptionSelect
            label=""
            aria-label="Passengers"
            value={passengers}
            options={[...ONLINE_PASSENGER_OPTIONS]}
            required
            onChange={setPassengers}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Suitcases
          <FiniteOptionSelect
            label=""
            aria-label="Suitcases"
            value={suitcases}
            options={[...PERSONAL_QUOTE_SUITCASE_OPTIONS]}
            required
            onChange={setSuitcases}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80 sm:col-span-2">
          Vehicle (pricing engine)
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value as VehicleType)}
            className={fieldClass}
          >
            {OWNER_PQ_VEHICLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-0 sm:col-span-2">
          <p className="text-sm text-white/80">Journey type</p>
          <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Journey type">
            {[
              { value: false, label: "One way" },
              { value: true, label: "Return" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={returnJourney === option.value}
                onClick={() => setReturnJourney(option.value)}
                className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                  returnJourney === option.value
                    ? "border-emerald bg-emerald/15 text-emerald"
                    : "border-white/15 text-white/75"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block min-w-0 text-sm text-white/80">
          Pickup date
          <input
            type="date"
            value={journeyDate}
            onChange={(e) => {
              setJourneyDate(e.target.value);
              setFareHint("");
            }}
            className={fieldClass}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Pickup time
          <input
            type="time"
            value={journeyTime}
            onChange={(e) => {
              setJourneyTime(e.target.value);
              setFareHint("");
            }}
            className={fieldClass}
          />
        </label>

        {returnJourney ? (
          <>
            <label className="block min-w-0 text-sm text-white/80">
              Return date
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block min-w-0 text-sm text-white/80">
              Return time
              <input
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className={fieldClass}
              />
            </label>
          </>
        ) : null}

        <div className="min-w-0 space-y-2 sm:col-span-2">
          <button
            type="button"
            disabled={calculatingFare}
            onClick={() => void handleCalculateWebsiteFare()}
            className="rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-2.5 text-sm font-bold text-emerald disabled:opacity-60"
          >
            {calculatingFare ? "Calculating…" : "Calculate website price"}
          </button>
          <p className="text-xs text-white/45">
            Same price as the public quote tool for this exact journey (your live pricing settings).
            The customer can change the date, time, passengers, cases, vehicle or one way/return on
            their link — it re-prices the same way, then your discount comes off.
          </p>
          {priceIsCurrent ? (
            <p className="text-lg font-bold text-white">
              Current website price:{" "}
              {formatPersonalQuoteAmount(Number(standardWebsiteAmount) || 0)}
            </p>
          ) : null}
          {fareHint ? <p className="break-words text-xs text-white/55">{fareHint}</p> : null}
        </div>

        <div className="min-w-0 sm:col-span-2">
          <p className="text-sm text-white/80">Your discount</p>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-2">
            <select
              aria-label="Discount type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value === "percent" ? "percent" : "amount")}
              className={fieldClass}
            >
              <option value="amount">£ off</option>
              <option value="percent">% off</option>
            </select>
            <input
              aria-label={discountType === "percent" ? "Discount percent" : "Discount in pounds"}
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => {
                if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setDiscountValue(e.target.value);
              }}
              className={fieldClass}
              placeholder={discountType === "percent" ? `e.g. 10 (max ${PERSONAL_QUOTE_MAX_DISCOUNT_PERCENT})` : "e.g. 10"}
            />
          </div>
          {pricePreview ? (
            <div className="mt-2 space-y-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
              <p className="flex justify-between gap-3 text-white/75">
                <span>Website price</span>
                <span>{formatPersonalQuoteAmount(pricePreview.websiteTransferGbp)}</span>
              </p>
              <p className="flex justify-between gap-3 text-emerald">
                <span>Your discount</span>
                <span>−{formatPersonalQuoteAmount(pricePreview.discountGbp)}</span>
              </p>
              <p className="flex justify-between gap-3 font-semibold text-white">
                <span>Customer pays</span>
                <span>{formatPersonalQuoteAmount(pricePreview.transferGbp)}</span>
              </p>
              <p className="pt-1 text-xs text-white/50">
                If the customer changes their journey, the website price is recalculated and the same
                {discountType === "percent" ? " percentage" : " £"} discount applies.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-white/45">Calculate the website price to see what the customer pays.</p>
          )}
        </div>

        {expressSelection.eligible && expressSelection.airportCode ? (
          <div className="min-w-0 space-y-2 sm:col-span-2">
            <ExpressDropOffSelector
              airportCode={expressSelection.airportCode}
              service={expressSelection.service ?? "drop-off"}
              allowFreeAlternative={expressSelection.freeAlternativeAvailable}
              selected={expressDropOffSelected}
              removalAcknowledged={expressRemovalAck}
              requireAcknowledgement={expressAckRequired}
              onSelectedChange={(selected) => {
                setExpressDropOffSelected(selected);
                setExpressAckRequired(false);
              }}
              onRemovalAcknowledgedChange={(ack) => {
                setExpressRemovalAck(ack);
                if (ack) setExpressAckRequired(false);
              }}
            />
            {customerTotalPreview ? (
              <div className="space-y-1 text-sm text-white/80">
                <p>
                  {expressDropOffBreakdownLabel(
                    expressSelection.airportCode,
                    expressDropOffSelected,
                    expressSelection.service ?? "drop-off",
                  )}
                </p>
                <p className="font-semibold text-white">
                  Total with Express:{" "}
                  {formatPersonalQuoteAmount(customerTotalPreview.totalGbp)}
                </p>
                <p className="text-xs text-white/50">
                  Discounted fare {formatPersonalQuoteAmount(customerTotalPreview.transferFareGbp)};
                  Express Drop-Off is added at payment and is not discounted.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="block min-w-0 text-sm text-white/80">
          Expiry date
          <input
            required
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 items-center gap-2 self-end pb-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={singleUse}
            onChange={(e) => setSingleUse(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-white/30 bg-navy text-emerald"
          />
          Single use
        </label>
        <label className="block min-w-0 text-sm text-white/80 sm:col-span-2">
          Agreed journey notes (optional — shown to customer)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
            placeholder="Meet at arrivals, name board"
          />
        </label>
        <div className="min-w-0 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create personal quote & link"}
          </button>
        </div>
      </form>

      {lastCreated ? (
        <div className="mt-3 w-full min-w-0 max-w-full space-y-2 break-words rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-3 text-sm text-emerald">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold tracking-wide">{lastCreated.code}</span>
            <span className="text-white/70">{lastCreated.amountLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastCreated.customerLink ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void copyText("Customer link copied", lastCreated.customerLink!)
                  }
                  className="rounded-md border border-emerald/40 px-2 py-1 text-xs font-medium hover:bg-emerald/20"
                >
                  Copy customer link
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      "WhatsApp message copied",
                      buildPersonalQuoteWhatsAppMessage({
                        customerName: lastCreated.customerName,
                        agreedAmount: lastCreated.agreedAmount,
                        pickupLabel: lastCreated.pickupLabel,
                        dropoffLabel: lastCreated.dropoffLabel,
                        customerUrl: lastCreated.customerLink!,
                      }),
                    )
                  }
                  className="rounded-md border border-emerald/40 px-2 py-1 text-xs font-medium hover:bg-emerald/20"
                >
                  Copy WhatsApp message
                </button>
                <a
                  href={lastCreated.customerLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-emerald/40 px-2 py-1 text-xs font-medium hover:bg-emerald/20"
                >
                  Open customer link
                </a>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void copyText(`Copied ${lastCreated.code}`, lastCreated.code)}
              className="rounded-md border border-white/20 px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Copy MQ code
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 break-words text-sm text-emerald">{message}</p> : null}
      {error ? <p className="mt-3 break-words text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 w-full min-w-0 max-w-full space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-white/45">
          Open quotes {loading ? "(loading…)" : `(${quotes.length})`}
        </p>
        {quotes.length === 0 && !loading ? (
          <p className="text-sm text-white/55">No active personal quotes.</p>
        ) : (
          <ul className="w-full min-w-0 max-w-full space-y-2">
            {quotes.map((quote) => {
              const link = customerLinkFor(quote);
              const save =
                typeof quote.standardWebsiteAmount === "number" &&
                quote.standardWebsiteAmount > quote.agreedAmount
                  ? Math.round((quote.standardWebsiteAmount - quote.agreedAmount) * 100) / 100
                  : null;
              return (
                <li
                  key={quote.code}
                  className="w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white/85"
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(`Copied ${quote.code}`, quote.code)}
                      className="font-mono font-semibold tracking-wide text-emerald hover:underline"
                    >
                      {quote.code}
                    </button>
                    <span className="font-semibold">{quote.amountLabel}</span>
                  </div>
                  <p className="mt-1 break-words text-xs text-white/60">
                    {quote.customerName}
                    {quote.standardWebsiteAmount != null
                      ? ` · website £${Number(quote.standardWebsiteAmount).toFixed(2)}`
                      : ""}
                    {save != null ? ` · saves £${save.toFixed(2)}` : ""}
                    {` · expires ${quote.expiresOn}`}
                    {quote.singleUse ? " · single use" : " · multi use"}
                    {quote.usedAt ? " · used" : " · unused"}
                  </p>
                  {(quote.pickupLabel || quote.dropoffLabel) && (
                    <p className="mt-1 break-words text-xs text-white/45">
                      {[quote.pickupLabel, quote.dropoffLabel].filter(Boolean).join(" → ")}
                    </p>
                  )}
                  {quote.notes ? (
                    <p className="mt-1 break-words text-xs text-white/45">{quote.notes}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {link ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void copyText("Customer link copied", link)}
                          className="rounded-md border border-emerald/30 px-2 py-1 text-xs font-medium text-emerald hover:bg-emerald/10"
                        >
                          Copy customer link
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              "WhatsApp message copied",
                              buildPersonalQuoteWhatsAppMessage({
                                customerName: quote.customerName,
                                agreedAmount: quote.agreedAmount,
                                pickupLabel: quote.pickupLabel,
                                dropoffLabel: quote.dropoffLabel,
                                customerUrl: link,
                              }),
                            )
                          }
                          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/5"
                        >
                          Copy WhatsApp message
                        </button>
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/5"
                        >
                          Open customer link
                        </a>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        applyPrefill({
                          customerName: quote.customerName,
                          customerEmail: quote.customerEmail,
                          customerMobile: quote.customerMobile,
                          pickupLabel: quote.pickupLabel,
                          dropoffLabel: quote.dropoffLabel,
                          journey: quote.journey,
                        })
                      }
                      className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/5"
                    >
                      Quote again
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeactivate(quote.code)}
                      className="text-xs text-amber-200/90 underline-offset-2 hover:underline"
                    >
                      Deactivate
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
