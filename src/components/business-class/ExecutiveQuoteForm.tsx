"use client";

/**
 * Business Class page — "Request an Executive Quote".
 *
 * Separate from the airport instant quote tool: no fare is calculated or shown here.
 * Submits to the existing manual-quotation backend (/bespoke-quotes/request, category
 * "business_class"), which re-validates everything, checks Turnstile, rate-limits,
 * de-duplicates identical requests for 24 hours, emails the owner and the customer,
 * and lists the enquiry in Owner Dashboard → More → Event & Business Class.
 */

import Link from "next/link";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import AddressInput from "@/components/AddressInput";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { SelectedPlace } from "@/lib/selected-place";
import { SITE } from "@/lib/data";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { BESPOKE_TURNSTILE_ACTION, TURNSTILE_SITE_KEY } from "@/lib/bespoke-public";
import { BespokeRequestError, submitBespokeRequest } from "@/lib/belfast-events-api";
import { BUSINESS_CLASS_MAX_PASSENGERS } from "../../../shared/passenger-limits";

type Purpose = "airport" | "corporate" | "private" | "other";

/** Journey purpose → existing Business Class service type in the Owner Dashboard. */
const PURPOSE_SERVICE_TYPE: Record<Purpose, string> = {
  airport: "executive_airport",
  corporate: "corporate",
  private: "bespoke_private",
  other: "other",
};
const PURPOSE_LABELS: Record<Purpose, string> = {
  airport: "Airport",
  corporate: "Corporate",
  private: "Private",
  other: "Other",
};

const SUITCASE_OPTIONS = ["0", "1", "2", "3+"] as const;

type Fields = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  date: string;
  time: string;
  passengers: string;
  suitcases: string;
  journeyType: "one_way" | "return";
  returnDate: string;
  returnTime: string;
  purpose: Purpose | "";
  flightNumber: string;
  specialRequirements: string;
  consent: boolean;
  website: string;
};

const INITIAL: Fields = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  pickupAddress: "",
  destinationAddress: "",
  date: "",
  time: "",
  passengers: "",
  suitcases: "",
  journeyType: "one_way",
  returnDate: "",
  returnTime: "",
  purpose: "",
  flightNumber: "",
  specialRequirements: "",
  consent: false,
  website: "",
};

/** Visual order, used to move focus to the first problem. Server error keys map onto these. */
const FIELD_ORDER = [
  "pickupAddress",
  "destinationAddress",
  "date",
  "time",
  "passengers",
  "suitcases",
  "returnDate",
  "returnTime",
  "purpose",
  "flightNumber",
  "specialRequirements",
  "customerName",
  "customerEmail",
  "customerPhone",
  "consent",
] as const;

const SERVER_KEY_MAP: Record<string, string> = {
  serviceType: "purpose",
  luggage: "suitcases",
  termsAccepted: "consent",
  privacyAcknowledged: "consent",
  specialRequirements: "specialRequirements",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FLIGHT = /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/i;

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Plain-text enquiry for the email fallback (used until online enquiries are switched on). */
function enquiryEmail(f: Fields): { subject: string; body: string } {
  const purpose = f.purpose ? PURPOSE_LABELS[f.purpose as Purpose] : "";
  const lines = [
    "Business Class enquiry (website)",
    "",
    `Name: ${f.customerName.trim()}`,
    `Email: ${f.customerEmail.trim()}`,
    `Telephone: ${f.customerPhone.trim()}`,
    "",
    `Pickup: ${f.pickupAddress.trim()}`,
    `Destination: ${f.destinationAddress.trim()}`,
    `Date and time: ${ukDate(f.date)} at ${f.time}`,
    `Journey: ${f.journeyType === "return" ? `Return — ${ukDate(f.returnDate)} at ${f.returnTime}` : "One way"}`,
    `Passengers: ${f.passengers}`,
    `Suitcases: ${luggageText(f.suitcases)}`,
    `Purpose: ${purpose}`,
    ...(f.purpose === "airport" && f.flightNumber.trim() ? [`Flight number: ${f.flightNumber.trim().toUpperCase()}`] : []),
    ...(f.specialRequirements.trim() ? ["", `Additional requirements: ${f.specialRequirements.trim()}`] : []),
    "",
    "I accept the Terms & Conditions and have read the Privacy Policy.",
  ];
  return {
    subject: `Business Class enquiry – ${f.customerName.trim()} – ${ukDate(f.date)}`,
    body: lines.join("\n"),
  };
}

function luggageText(value: string): string {
  if (value === "0") return "No large suitcases";
  if (value === "1") return "1 large suitcase";
  if (value === "3+") return "3 or more large suitcases (please confirm vehicle suitability)";
  return `${value} large suitcases`;
}

const input =
  "bc-input mt-2 block h-12 w-full min-w-0 rounded-xl border border-white/15  px-4 text-base bc-c-w  outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/25 focus:border-emerald  focus:ring-2 focus:ring-emerald/30 aria-[invalid=true]:border-[#ff8a80] [color-scheme:dark]";
const label = "block text-[0.8125rem] font-semibold uppercase tracking-[0.14em] bc-c-label";
const hint = "mt-1.5 block text-sm bc-c-w60";
const errorText = "mt-1.5 block text-sm font-medium bc-c-err";
const legend = "font-display text-2xl font-medium bc-c-w sm:text-[1.75rem]";

export default function ExecutiveQuoteForm() {
  const uid = useId();
  const id = (name: string) => `bc-${uid.replace(/:/g, "")}-${name}`;
  const [fields, setFields] = useState<Fields>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [token, setToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [emailPrepared, setEmailPrepared] = useState<string | null>(null);
  const [placeIds, setPlaceIds] = useState({ pickup: "", destination: "" });
  const [minDate, setMinDate] = useState("");
  const inFlight = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);
  const onlineAvailable = Boolean(TURNSTILE_SITE_KEY);

  useEffect(() => setMinDate(todayLocalIso()), []);

  useEffect(() => {
    if ((!reference && !emailPrepared) || !successRef.current) return;
    successRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    successRef.current.focus({ preventScroll: true });
  }, [reference, emailPrepared]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => {
      const next = { ...f, [key]: value };
      if (key === "date" && f.journeyType === "return" && !f.returnDate) next.returnDate = String(value);
      if (key === "journeyType" && value === "return" && !f.returnDate) next.returnDate = f.date;
      return next;
    });
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: "" }));
  };

  const describedBy = (name: string, withHint = false) =>
    [withHint ? id(`${name}-hint`) : "", errors[name] ? id(`${name}-error`) : ""].filter(Boolean).join(" ") || undefined;

  const err = (name: string) =>
    errors[name] ? (
      <span id={id(`${name}-error`)} className={errorText}>
        {errors[name]}
      </span>
    ) : null;

  function check(): Record<string, string> {
    const e: Record<string, string> = {};
    const name = fields.customerName.trim();
    if (!name) e.customerName = "Please enter your full name.";
    else if (name.length < 2) e.customerName = "Please enter your full name.";
    if (!fields.customerEmail.trim()) e.customerEmail = "Please enter your email address.";
    else if (!EMAIL.test(fields.customerEmail.trim())) e.customerEmail = "Please enter a valid email address.";
    const digits = fields.customerPhone.replace(/\D/g, "");
    if (!fields.customerPhone.trim()) e.customerPhone = "Please enter a contact telephone number.";
    else if (digits.length < 7 || digits.length > 15) e.customerPhone = "Please enter a valid telephone number.";
    if (fields.pickupAddress.trim().length < 5) e.pickupAddress = "Please enter the full pickup address.";
    if (fields.destinationAddress.trim().length < 3) e.destinationAddress = "Please enter the destination.";
    if (!fields.date) e.date = "Please choose the pickup date.";
    else if (minDate && fields.date < minDate) e.date = "Please choose today or a later date.";
    if (!fields.time) e.time = "Please choose the pickup time.";
    if (!fields.passengers) e.passengers = "Please choose the number of passengers.";
    if (!fields.suitcases) e.suitcases = "Please choose the number of suitcases.";
    if (fields.journeyType === "return") {
      if (!fields.returnDate) e.returnDate = "Please choose the return date.";
      else if (fields.date && fields.returnDate < fields.date) e.returnDate = "The return must be on or after the outward date.";
      if (!fields.returnTime) e.returnTime = "Please choose the return pickup time.";
      else if (fields.returnDate && fields.returnDate === fields.date && fields.time && fields.returnTime <= fields.time) {
        e.returnTime = "The return must be after the outward journey.";
      }
    }
    if (!fields.purpose) e.purpose = "Please choose the purpose of the journey.";
    if (fields.purpose === "airport" && fields.flightNumber.trim() && !FLIGHT.test(fields.flightNumber.trim())) {
      e.flightNumber = "Please enter a valid flight number, e.g. BA1426.";
    }
    if (!fields.consent) e.consent = "Please confirm you accept the Terms & Conditions and have read the Privacy Policy.";
    return e;
  }

  function focusFirst(e: Record<string, string>) {
    const first = FIELD_ORDER.find((k) => e[k]);
    if (!first) return;
    const el = document.getElementById(id(first));
    const target = el?.matches("input, select, textarea, button") ? el : el?.querySelector<HTMLElement>("input, button, select");
    target?.focus();
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (inFlight.current) return;
    setFormError("");
    const local = check();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError("Please check the highlighted details.");
      focusFirst(local);
      return;
    }
    if (!onlineAvailable) {
      // Online enquiries are not switched on yet: hand over a ready-written email.
      const { subject, body } = enquiryEmail(fields);
      const href = `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setEmailPrepared(href);
      window.location.href = href;
      return;
    }
    if (!token) {
      setFormError("Please wait a moment for the security check to finish, then send again.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const purpose = fields.purpose as Purpose;
      const payload: Record<string, unknown> = {
        category: "business_class",
        serviceType: PURPOSE_SERVICE_TYPE[purpose],
        customerName: fields.customerName.trim(),
        customerEmail: fields.customerEmail.trim(),
        customerPhone: fields.customerPhone.trim(),
        pickupAddress: fields.pickupAddress.trim(),
        ...(placeIds.pickup ? { pickupPlaceId: placeIds.pickup } : {}),
        destinationAddress: fields.destinationAddress.trim(),
        ...(placeIds.destination ? { destinationPlaceId: placeIds.destination } : {}),
        date: fields.date,
        time: fields.time,
        returnJourney: fields.journeyType === "return",
        ...(fields.journeyType === "return" ? { returnDate: fields.returnDate, returnTime: fields.returnTime } : {}),
        passengers: Number(fields.passengers),
        luggage: luggageText(fields.suitcases),
        ...(purpose === "airport" && fields.flightNumber.trim() ? { flightNumber: fields.flightNumber.trim().toUpperCase() } : {}),
        ...(fields.specialRequirements.trim() ? { specialRequirements: fields.specialRequirements.trim() } : {}),
        termsAccepted: fields.consent,
        privacyAcknowledged: fields.consent,
        termsVersion: TERMS_LAST_UPDATED,
        turnstileToken: token,
        website: fields.website,
      };
      const result = await submitBespokeRequest(payload);
      setReference(result.reference);
    } catch (e) {
      const problem = e instanceof BespokeRequestError ? e : null;
      setFormError(problem?.message ?? "Something went wrong. Please try again, or call or WhatsApp us.");
      if (problem && Object.keys(problem.errors).length > 0) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(problem.errors)) mapped[SERVER_KEY_MAP[k] ?? k] = v;
        setErrors(mapped);
        focusFirst(mapped);
      }
      setToken("");
      setResetSignal((n) => n + 1);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (emailPrepared && !reference) {
    return (
      <div ref={successRef} tabIndex={-1} role="status" aria-live="polite" data-bc-enquiry-email className="bc-form-card rounded-[1.75rem] p-7 outline-none sm:p-10">
        <span className="bc-gold-rule" aria-hidden="true" />
        <p className="mt-6 text-[0.75rem] font-semibold uppercase tracking-[0.24em] bc-c-gold">Almost done</p>
        <h3 className="mt-3 font-display text-3xl font-medium leading-tight bc-c-w sm:text-4xl">Your enquiry email is ready.</h3>
        <p className="mt-4 text-base leading-relaxed bc-c-w80">
          We&apos;ve opened your email app with your journey details addressed to <strong className="bc-c-w">{SITE.email}</strong>. Just press send and we&apos;ll reply with a personal quotation.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <a href={emailPrepared} className="bc-btn-primary">Open the email again</a>
          <button type="button" className="bc-btn-ghost" onClick={() => setEmailPrepared(null)}>Edit my details</button>
        </div>
        <p className="mt-7 text-sm bc-c-w65">
          Email didn&apos;t open? Write to {SITE.email}, or call{" "}
          <a className="font-semibold bc-c-em underline underline-offset-4" href={`tel:${SITE.officeLandline}`}>{SITE.officeLandlineDisplay}</a>.
        </p>
      </div>
    );
  }

  if (reference) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-bc-enquiry-success
        className="bc-form-card rounded-[1.75rem] p-7 outline-none sm:p-10"
      >
        <span className="bc-gold-rule" aria-hidden="true" />
        <p className="mt-6 text-[0.75rem] font-semibold uppercase tracking-[0.24em] bc-c-gold">Enquiry received</p>
        <h3 className="mt-3 font-display text-3xl font-medium leading-tight bc-c-w sm:text-4xl">
          Thank you, {fields.customerName.trim().split(/\s+/)[0]}.
        </h3>
        <p className="mt-4 text-base leading-relaxed bc-c-w80">
          Your Business Class enquiry reference is <strong className="bc-c-w">{reference}</strong>. A copy is on its way to{" "}
          <strong className="bc-c-w">{fields.customerEmail.trim()}</strong>.
        </p>
        <ol className="mt-7 space-y-4 border-t border-white/10 pt-6 text-[0.9375rem] leading-relaxed bc-c-w80">
          <li className="flex gap-4">
            <span className="font-display text-xl bc-c-gold">i.</span> We review your journey and check availability.
          </li>
          <li className="flex gap-4">
            <span className="font-display text-xl bc-c-gold">ii.</span> We email you a personal quotation with a secure link.
          </li>
          <li className="flex gap-4">
            <span className="font-display text-xl bc-c-gold">iii.</span> Your booking is confirmed only once you accept and pay.
          </li>
        </ol>
        <p className="mt-7 text-sm bc-c-w65">
          Anything to add? Call{" "}
          <a className="font-semibold bc-c-em underline underline-offset-4" href={`tel:${SITE.officeLandline}`}>
            {SITE.officeLandlineDisplay}
          </a>{" "}
          or WhatsApp us quoting {reference}.
        </p>
      </div>
    );
  }

  const purposes = Object.keys(PURPOSE_LABELS) as Purpose[];

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      data-bc-executive-quote-form
      aria-describedby={formError ? id("form-error") : undefined}
      className="bc-form-card rounded-[1.75rem] p-5 sm:p-8 lg:p-10"
    >
      <span className="bc-gold-rule" aria-hidden="true" />
      {formError ? (
        <p id={id("form-error")} role="alert" className="mt-6 rounded-xl border border-[#ff8a80]/50 bg-[#ff8a80]/10 p-4 text-sm font-medium bc-c-err-soft">
          {formError}
        </p>
      ) : null}

      {/* Journey */}
      <fieldset className="mt-6 min-w-0 space-y-6">
        <legend className={legend}>The journey</legend>
        <div className="pt-2">
          <AddressInput
            id={id("pickupAddress")}
            name="pickupAddress"
            label="Pickup address"
            placeholder="Address, hotel, airport or postcode"
            value={fields.pickupAddress}
            onChange={(value) => {
              set("pickupAddress", value.slice(0, 300));
              setPlaceIds((p) => (p.pickup ? { ...p, pickup: "" } : p));
            }}
            onSelectPlace={(place: SelectedPlace) => setPlaceIds((p) => ({ ...p, pickup: place.placeId || "" }))}
            selectionError={errors.pickupAddress || undefined}
            reserveHelperSpace={false}
          />
        </div>
        <AddressInput
          id={id("destinationAddress")}
          name="destinationAddress"
          label="Destination address"
          placeholder="Address, hotel, airport or postcode"
          value={fields.destinationAddress}
          onChange={(value) => {
            set("destinationAddress", value.slice(0, 300));
            setPlaceIds((p) => (p.destination ? { ...p, destination: "" } : p));
          }}
          onSelectPlace={(place: SelectedPlace) => setPlaceIds((p) => ({ ...p, destination: place.placeId || "" }))}
          selectionError={errors.destinationAddress || undefined}
          reserveHelperSpace={false}
        />

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={label} htmlFor={id("date")}>Pickup date</label>
            <input id={id("date")} type="date" min={minDate || undefined} className={input} value={fields.date} onChange={(e) => set("date", e.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={describedBy("date")} />
            {err("date")}
          </div>
          <div className="min-w-0">
            <label className={label} htmlFor={id("time")}>Pickup time</label>
            <input id={id("time")} type="time" step={300} className={input} value={fields.time} onChange={(e) => set("time", e.target.value)} aria-invalid={Boolean(errors.time)} aria-describedby={describedBy("time")} />
            {err("time")}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-5">
          <div className="min-w-0">
            <label className={label} htmlFor={id("passengers")}>Passengers</label>
            <select id={id("passengers")} className={`${input} bc-select`} value={fields.passengers} onChange={(e) => set("passengers", e.target.value)} aria-invalid={Boolean(errors.passengers)} aria-describedby={describedBy("passengers", true)}>
              <option value="">Select</option>
              {Array.from({ length: BUSINESS_CLASS_MAX_PASSENGERS }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span id={id("passengers-hint")} className={hint}>Up to {BUSINESS_CLASS_MAX_PASSENGERS}</span>
            {err("passengers")}
          </div>
          <div className="min-w-0">
            <label className={label} htmlFor={id("suitcases")}>Suitcases</label>
            <select id={id("suitcases")} className={`${input} bc-select`} value={fields.suitcases} onChange={(e) => set("suitcases", e.target.value)} aria-invalid={Boolean(errors.suitcases)} aria-describedby={describedBy("suitcases", true)}>
              <option value="">Select</option>
              {SUITCASE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span id={id("suitcases-hint")} className={hint}>Up to 2 large (23kg)</span>
            {err("suitcases")}
          </div>
        </div>

        <div role="radiogroup" aria-labelledby={id("journeyType-label")} className="min-w-0">
          <span id={id("journeyType-label")} className={label}>Journey type</span>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/15 p-1.5">
            {(["one_way", "return"] as const).map((t) => (
              <label key={t} className="bc-segment">
                <input type="radio" name={id("journeyType")} value={t} checked={fields.journeyType === t} onChange={() => set("journeyType", t)} className="peer sr-only" />
                <span>{t === "one_way" ? "One way" : "Return"}</span>
              </label>
            ))}
          </div>
        </div>

        {fields.journeyType === "return" ? (
          <div className="bc-conditional grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <label className={label} htmlFor={id("returnDate")}>Return date</label>
              <input id={id("returnDate")} type="date" min={fields.date || minDate || undefined} className={input} value={fields.returnDate} onChange={(e) => set("returnDate", e.target.value)} aria-invalid={Boolean(errors.returnDate)} aria-describedby={describedBy("returnDate")} />
              {err("returnDate")}
            </div>
            <div className="min-w-0">
              <label className={label} htmlFor={id("returnTime")}>Return pickup time</label>
              <input id={id("returnTime")} type="time" step={300} className={input} value={fields.returnTime} onChange={(e) => set("returnTime", e.target.value)} aria-invalid={Boolean(errors.returnTime)} aria-describedby={describedBy("returnTime")} />
              {err("returnTime")}
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <span id={id("purpose-label")} className={label}>Journey purpose</span>
          <div
            id={id("purpose")}
            role="radiogroup"
            aria-labelledby={id("purpose-label")}
            aria-describedby={describedBy("purpose")}
            aria-invalid={Boolean(errors.purpose)}
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {purposes.map((p) => (
              <label key={p} className="bc-chip">
                <input type="radio" name={id("purpose-radio")} value={p} checked={fields.purpose === p} onChange={() => set("purpose", p)} className="peer sr-only" />
                <span>{PURPOSE_LABELS[p]}</span>
              </label>
            ))}
          </div>
          {err("purpose")}
        </div>

        {fields.purpose === "airport" ? (
          <div className="bc-conditional min-w-0">
            <label className={label} htmlFor={id("flightNumber")}>Flight number <span className="normal-case tracking-normal bc-c-w55">(if known)</span></label>
            <input id={id("flightNumber")} className={`${input} uppercase placeholder:normal-case`} value={fields.flightNumber} maxLength={10} placeholder="e.g. BA1426" autoCapitalize="characters" autoComplete="off" onChange={(e) => set("flightNumber", e.target.value)} aria-invalid={Boolean(errors.flightNumber)} aria-describedby={describedBy("flightNumber", true)} />
            <span id={id("flightNumber-hint")} className={hint}>For arrivals, we monitor your flight and adjust the collection time.</span>
            {err("flightNumber")}
          </div>
        ) : null}

        <div className="min-w-0">
          <label className={label} htmlFor={id("specialRequirements")}>Additional requirements <span className="normal-case tracking-normal bc-c-w55">(optional)</span></label>
          <textarea id={id("specialRequirements")} className={`${input} h-auto min-h-28 resize-y py-3`} value={fields.specialRequirements} maxLength={1000} placeholder="Meeting arrangements, a name board, stops along the way, timings to work around…" onChange={(e) => set("specialRequirements", e.target.value)} aria-invalid={Boolean(errors.specialRequirements)} aria-describedby={describedBy("specialRequirements")} />
          {err("specialRequirements")}
        </div>
      </fieldset>

      {/* Contact */}
      <fieldset className="mt-10 min-w-0 space-y-6 border-t border-white/10 pt-8">
        <legend className={`${legend} float-left w-full`}>Your details</legend>
        <div className="clear-both min-w-0 pt-2">
          <label className={label} htmlFor={id("customerName")}>Full name</label>
          <input id={id("customerName")} className={input} value={fields.customerName} maxLength={100} autoComplete="name" onChange={(e) => set("customerName", e.target.value)} aria-invalid={Boolean(errors.customerName)} aria-describedby={describedBy("customerName")} />
          {err("customerName")}
        </div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={label} htmlFor={id("customerEmail")}>Email address</label>
            <input id={id("customerEmail")} type="email" inputMode="email" autoComplete="email" className={input} value={fields.customerEmail} maxLength={254} onChange={(e) => set("customerEmail", e.target.value)} aria-invalid={Boolean(errors.customerEmail)} aria-describedby={describedBy("customerEmail")} />
            {err("customerEmail")}
          </div>
          <div className="min-w-0">
            <label className={label} htmlFor={id("customerPhone")}>Contact telephone</label>
            <input id={id("customerPhone")} type="tel" inputMode="tel" autoComplete="tel" className={input} value={fields.customerPhone} maxLength={30} onChange={(e) => set("customerPhone", e.target.value)} aria-invalid={Boolean(errors.customerPhone)} aria-describedby={describedBy("customerPhone")} />
            {err("customerPhone")}
          </div>
        </div>

        {/* Honeypot — hidden from people and assistive technology. */}
        <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={fields.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3.5 text-[0.9375rem] leading-relaxed bc-c-w80" htmlFor={id("consent")}>
          <input id={id("consent")} type="checkbox" className="bc-check mt-0.5 h-5 w-5 shrink-0" checked={fields.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={describedBy("consent")} />
          <span>
            I accept the{" "}
            <Link href="/terms/" className="bc-c-w underline decoration-[#C8AD79] underline-offset-4 bc-hover-gold" target="_blank">
              Terms &amp; Conditions
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy/" className="bc-c-w underline decoration-[#C8AD79] underline-offset-4 bc-hover-gold" target="_blank">
              Privacy Policy
            </Link>
            . My details are used only to respond to this enquiry.
          </span>
        </label>
        {err("consent")}
      </fieldset>

      <div className="mt-8 space-y-5">
        {onlineAvailable ? (
          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action={BESPOKE_TURNSTILE_ACTION} onToken={setToken} resetSignal={resetSignal} />
        ) : (
          <p className="text-sm leading-relaxed bc-c-w65" role="note">
            Sending opens your email app with your enquiry ready to go to {SITE.email}. Prefer to talk? Call{" "}
            <a className="font-semibold bc-c-w underline underline-offset-4" href={`tel:${SITE.officeLandline}`}>{SITE.officeLandlineDisplay}</a>.
          </p>
        )}
        <button type="submit" disabled={submitting} aria-disabled={submitting} className="bc-btn-primary w-full sm:w-auto">
          {submitting ? "Sending your enquiry…" : "Request My Executive Quote"}
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-sm leading-relaxed bc-c-w60">
          No payment is taken now. We reply with a personal quotation, and your journey is confirmed only when you accept and pay.
        </p>
      </div>
    </form>
  );
}
