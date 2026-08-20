"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddressInput from "@/components/AddressInput";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/data";
import { formatQuote } from "@/lib/quote";
import {
  createOwnerPersonalQuote,
  deactivateOwnerPersonalQuote,
  fetchOwnerPersonalQuotes,
  type PersonalQuoteOwnerView,
} from "@/lib/personal-quote-api";
import {
  emptySelectedPlace,
  isPlaceSelected,
  placeDisplayText,
  type SelectedPlace,
} from "@/lib/selected-place";
import { fetchTripRouteMetrics } from "@/lib/trip-route";
import { selectVehicleForParty } from "@/lib/vehicle-selection";
import { calculateWebsiteOneWayFare } from "@/lib/website-fare";
import {
  buildPersonalQuoteWhatsAppMessage,
  computeLinkedPersonalQuoteFares,
  formatPersonalQuoteAmount,
  PERSONAL_QUOTE_MAX_PASSENGERS,
  PERSONAL_QUOTE_MIN_PASSENGERS,
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
  const [agreedAmount, setAgreedAmount] = useState("");
  const [standardWebsiteAmount, setStandardWebsiteAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
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

  const savingsPreview = useMemo(() => {
    const standard = parseMoney(standardWebsiteAmount);
    const agreed = parseMoney(agreedAmount);
    if (standard == null || agreed == null) return null;
    const save = Math.round((standard - agreed) * 100) / 100;
    if (save <= 0) return null;
    return save;
  }, [standardWebsiteAmount, agreedAmount]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchOwnerPersonalQuotes(ownerKey);
      setQuotes(list);
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

  function applyLinkedFares(edited: "discount" | "agreed" | "standard") {
    const standard = parseMoney(standardWebsiteAmount);
    if (standard == null) return;
    const linked = computeLinkedPersonalQuoteFares({
      standardWebsiteAmount: standard,
      discountAmount: parseMoney(discountAmount),
      agreedAmount: parseMoney(agreedAmount),
      edited,
    });
    if (!linked) return;
    if (linked.discountAmount != null) {
      setDiscountAmount(String(linked.discountAmount));
    }
    if (linked.agreedAmount != null) {
      setAgreedAmount(String(linked.agreedAmount));
    }
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

      let routeMetrics = null;
      if (
        isPlaceSelected(pickupPlace) &&
        isPlaceSelected(dropoffPlace) &&
        typeof pickupPlace.lat === "number" &&
        typeof pickupPlace.lng === "number" &&
        typeof dropoffPlace.lat === "number" &&
        typeof dropoffPlace.lng === "number"
      ) {
        routeMetrics = await fetchTripRouteMetrics(
          pickupPlace.lat,
          pickupPlace.lng,
          dropoffPlace.lat,
          dropoffPlace.lng,
        );
      }

      const quote = calculateWebsiteOneWayFare({
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        pickupPlace: isPlaceSelected(pickupPlace) ? pickupPlace : null,
        dropoffPlace: isPlaceSelected(dropoffPlace) ? dropoffPlace : null,
        vehicleType: vehicle,
        routeMetrics,
        schedule: {
          outboundDate: journeyDate.trim() || undefined,
          outboundTime: journeyTime.trim() || undefined,
          returnJourney: false,
        },
      });

      if (!quote || !Number.isFinite(quote.amount)) {
        throw new Error(
          "Could not calculate a live website fare for that journey. Choose addresses from suggestions (for route distance) or enter the website fare manually.",
        );
      }

      const oneWay = Math.round(quote.amount * 100) / 100;
      setStandardWebsiteAmount(String(oneWay));
      setPickupLabel(pickup);
      setDropoffLabel(dropoff);
      // Default agreed = website fare (no discount) unless a discount was already set.
      const existingDiscount = parseMoney(discountAmount);
      if (existingDiscount != null && existingDiscount > 0 && existingDiscount < oneWay) {
        setAgreedAmount(String(Math.round((oneWay - existingDiscount) * 100) / 100));
        setDiscountAmount(String(existingDiscount));
      } else {
        setAgreedAmount(String(oneWay));
        setDiscountAmount("0");
      }
      setFareHint(`Current website price: ${formatQuote(oneWay)} (one-way, same engine as the public quote calculator)`);
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
      const quote = await createOwnerPersonalQuote(ownerKey, {
        customerName,
        customerEmail: customerEmail.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        agreedAmount: Number(agreedAmount),
        standardWebsiteAmount: standardWebsiteAmount.trim()
          ? Number(standardWebsiteAmount)
          : undefined,
        discountAmount: discountAmount.trim() ? Number(discountAmount) : undefined,
        expiresOn,
        singleUse,
        notes: notes.trim() || undefined,
        pickupLabel: pickupLabel.trim() || undefined,
        dropoffLabel: dropoffLabel.trim() || undefined,
      });
      setLastCreated(quote);
      setMessage(`Personal quote created: ${quote.code} · ${quote.amountLabel}`);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerMobile("");
      setAgreedAmount("");
      setStandardWebsiteAmount("");
      setDiscountAmount("");
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create personal quote");
    } finally {
      setSaving(false);
    }
  }

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

      <form
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
          />
        </div>
        <label className="block min-w-0 text-sm text-white/80">
          Passengers (max {PERSONAL_QUOTE_MAX_PASSENGERS})
          <input
            type="number"
            min={PERSONAL_QUOTE_MIN_PASSENGERS}
            max={PERSONAL_QUOTE_MAX_PASSENGERS}
            value={passengers}
            onChange={(e) =>
              setPassengers(
                Math.min(
                  PERSONAL_QUOTE_MAX_PASSENGERS,
                  Math.max(PERSONAL_QUOTE_MIN_PASSENGERS, Number(e.target.value) || 1),
                ),
              )
            }
            className={fieldClass}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Suitcases
          <input
            type="number"
            min={0}
            max={4}
            value={suitcases}
            onChange={(e) =>
              setSuitcases(Math.min(4, Math.max(0, Number(e.target.value) || 0)))
            }
            className={fieldClass}
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
        <label className="block min-w-0 text-sm text-white/80">
          Journey date (for website pricing)
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
          Journey time (for website pricing)
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
            Uses the same pricing engine as the public quote calculator. Stores the one-way website
            fare (weekday and weekend use the same base fare; return bookings keep the 5% discount).
          </p>
          {standardWebsiteAmount.trim() ? (
            <p className="text-lg font-bold text-white">
              Current website price:{" "}
              {formatPersonalQuoteAmount(Number(standardWebsiteAmount) || 0)}
            </p>
          ) : null}
          {fareHint ? <p className="break-words text-xs text-white/55">{fareHint}</p> : null}
        </div>

        <label className="block min-w-0 text-sm text-white/80">
          Website fare (£)
          <input
            inputMode="decimal"
            value={standardWebsiteAmount}
            onChange={(e) => setStandardWebsiteAmount(e.target.value)}
            onBlur={() => applyLinkedFares("standard")}
            className={fieldClass}
            placeholder="75"
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Discount (£)
          <input
            inputMode="decimal"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            onBlur={() => applyLinkedFares("discount")}
            className={fieldClass}
            placeholder="10"
            disabled={!standardWebsiteAmount.trim()}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/80">
          Final personal fare (£)
          <input
            required
            inputMode="decimal"
            value={agreedAmount}
            onChange={(e) => setAgreedAmount(e.target.value)}
            onBlur={() => {
              if (standardWebsiteAmount.trim()) applyLinkedFares("agreed");
            }}
            className={fieldClass}
            placeholder="65"
          />
        </label>
        <div className="flex min-w-0 items-end pb-2 text-sm text-emerald">
          {savingsPreview != null ? (
            <p className="break-words">Customer saves {formatPersonalQuoteAmount(savingsPreview)}</p>
          ) : (
            <p className="text-white/40">No personal discount</p>
          )}
        </div>

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
