"use client";

/**
 * Public request form for Event Transfers and bespoke Business Class journeys.
 * Posts to the existing bespoke backend (/bespoke-quotes/request), which
 * validates everything again, checks Turnstile and rate limits, and puts the
 * request in Owner Dashboard → Event & Business Class. No price is shown here:
 * the owner sends a personal quotation after checking availability.
 */

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import AddressInput from "@/components/AddressInput";
import D3TimePicker from "@/components/D3TimePicker";
import TurnstileWidget from "@/components/TurnstileWidget";
import { useMobileDesign3 } from "@/lib/use-mobile-design3";
import type { SelectedPlace } from "@/lib/selected-place";
import { SITE } from "@/lib/data";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import {
  BESPOKE_TURNSTILE_ACTION,
  EVENT_REQUEST_MAX_PASSENGERS,
  GROUP_VEHICLE_FROM_PASSENGERS,
  TURNSTILE_SITE_KEY,
} from "@/lib/bespoke-public";
import { BespokeRequestError, submitBespokeRequest } from "@/lib/belfast-events-api";
import {
  BUSINESS_CLASS_REQUEST_SERVICE_LABELS,
  BUSINESS_CLASS_REQUEST_SERVICE_TYPES,
} from "../../shared/bespoke-quote";
import { BUSINESS_CLASS_MAX_PASSENGERS } from "../../shared/passenger-limits";
import type { BelfastEventPublic } from "../../shared/belfast-events";
import { formatUkDate } from "../../shared/uk-time";

const inputClass =
  "mt-1.5 block min-h-12 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30";
const labelClass = "block text-sm font-semibold text-white";
const hintClass = "mt-1 block text-sm text-white/55";
const errorClass = "mt-1 block text-sm font-medium text-[#b42318]";

type Category = "event" | "business_class";

type Props = {
  category: Category;
  /** Approved listing chosen on the Events hub (event requests only). */
  event?: BelfastEventPublic | null;
};

type Fields = {
  eventTitle: string;
  eventVenue: string;
  eventDate: string;
  serviceType: string;
  pickupAddress: string;
  destinationAddress: string;
  date: string;
  time: string;
  returnJourney: boolean;
  returnDate: string;
  returnTime: string;
  passengers: string;
  groupVehicleRequested: boolean;
  luggage: string;
  flightNumber: string;
  specialRequirements: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  website: string;
};

function initialFields(category: Category, event?: BelfastEventPublic | null): Fields {
  return {
    eventTitle: event?.title ?? "",
    eventVenue: event ? event.venueName : "",
    eventDate: event?.date ?? "",
    serviceType: "",
    pickupAddress: "",
    destinationAddress: event ? `${event.venueName}, ${event.venueArea}` : "",
    date: event?.date ?? "",
    time: "",
    returnJourney: category === "event",
    returnDate: event?.date ?? "",
    returnTime: event?.endTime ?? "",
    passengers: "",
    groupVehicleRequested: false,
    luggage: "",
    flightNumber: "",
    specialRequirements: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    termsAccepted: false,
    privacyAcknowledged: false,
    website: "",
  };
}

/** Field order for moving focus to the first problem. */
const FIELD_ORDER = [
  "eventTitle",
  "eventVenue",
  "eventDate",
  "serviceType",
  "pickupAddress",
  "destinationAddress",
  "date",
  "time",
  "returnDate",
  "returnTime",
  "passengers",
  "flightNumber",
  "customerName",
  "customerEmail",
  "customerPhone",
  "termsAccepted",
  "privacyAcknowledged",
];

/** Display only (dd/mm/yy), like the airport form: the native input keeps the ISO date. */
function shortUkDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Select date";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function openNativePicker(input: HTMLInputElement & { showPicker?: () => void }) {
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Not allowed without a user gesture — the phone opens it on tap anyway.
  }
}

type ScheduleFieldProps = {
  id: string;
  kind: "date" | "time";
  label: string;
  value: string;
  onChange: (value: string) => void;
  design3: boolean;
  invalid: boolean;
  describedBy?: string;
  min?: string;
};

/**
 * Date / time box. Phones and tablets on Design 3 get the same treatment as the
 * airport booking form: the date shows as dd/mm/yy over the phone's light calendar,
 * and the time opens the Design 3 hour/minute selector (D3TimePicker, unchanged).
 * Desktop and the classic mobile design keep the browser's own date and time boxes.
 */
function ScheduleField({ id, kind, label, value, onChange, design3, invalid, describedBy, min }: ScheduleFieldProps) {
  const Icon = kind === "date" ? Calendar : Clock;
  if (!design3) {
    return (
      <>
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
        <input id={id} type={kind} min={min} className={`${inputClass} [color-scheme:light]`} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={describedBy} />
      </>
    );
  }
  return (
    <>
      {kind === "date" ? (
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      <div
        id={kind === "time" ? id : undefined}
        data-bespoke-schedule={kind}
        data-schedule-control={kind === "time" ? "time" : undefined}
        data-invalid={invalid || undefined}
        className="relative mt-1.5 h-[52px] w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 focus-within:border-emerald/50 focus-within:ring-1 focus-within:ring-emerald/30"
      >
        <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-emerald" size={18} strokeWidth={1.8} aria-hidden="true" />
        {kind === "date" ? (
          <>
            <span data-bespoke-schedule-text data-empty={!value || undefined} aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[2.6rem] right-3 flex items-center text-base font-bold text-white">
              {shortUkDate(value)}
            </span>
            <input
              id={id}
              type="date"
              min={min}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onClick={(e) => openNativePicker(e.currentTarget)}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:light]"
            />
          </>
        ) : (
          <D3TimePicker idBase={`${id}-d3`} value={value} label={label} onChange={onChange} />
        )}
      </div>
    </>
  );
}

export default function BespokeRequestForm({ category, event = null }: Props) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [fields, setFields] = useState<Fields>(() => initialFields(category, event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [token, setToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const design3 = useMobileDesign3();
  // Google Place IDs for chosen suggestions; cleared as soon as the text is edited.
  const [placeIds, setPlaceIds] = useState<{ pickup: string; destination: string }>({ pickup: "", destination: "" });
  const choosePlace = (which: "pickup" | "destination") => (place: SelectedPlace) =>
    setPlaceIds((ids) => ({ ...ids, [which]: place.placeId || "" }));
  const successRef = useRef<HTMLDivElement>(null);

  // Bring the confirmation into view and move focus to it for screen readers.
  useEffect(() => {
    if (!reference || !successRef.current) return;
    successRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    successRef.current.focus({ preventScroll: true });
  }, [reference]);

  // A listing chosen after first render (live list loaded) fills the event fields once.
  useEffect(() => {
    if (!event) return;
    setFields((f) => (f.eventTitle ? f : { ...f, ...initialFields(category, event), customerName: f.customerName }));
  }, [event, category]);

  const maxPassengers = category === "business_class" ? BUSINESS_CLASS_MAX_PASSENGERS : EVENT_REQUEST_MAX_PASSENGERS;
  const passengerCount = Number(fields.passengers) || 0;
  const showGroupOption = category === "event" && passengerCount >= GROUP_VEHICLE_FROM_PASSENGERS;
  const listed = Boolean(event);
  const onlineAvailable = Boolean(TURNSTILE_SITE_KEY);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => {
      const next = { ...f, [key]: value };
      if (key === "passengers") {
        const n = Number(value) || 0;
        // 5–7 passengers needs the 7-seater; it is requested, never promised.
        next.groupVehicleRequested = category === "event" && n >= GROUP_VEHICLE_FROM_PASSENGERS;
      }
      if (key === "date" && !f.returnDate) next.returnDate = String(value);
      return next;
    });
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: "" }));
  };

  const describedBy = (name: string, hint?: boolean) =>
    [hint ? id(`${name}-hint`) : "", errors[name] ? id(`${name}-error`) : ""].filter(Boolean).join(" ") || undefined;

  const err = (name: string) =>
    errors[name] ? (
      <span id={id(`${name}-error`)} className={errorClass}>
        {errors[name]}
      </span>
    ) : null;

  const passengerOptions = useMemo(() => Array.from({ length: maxPassengers }, (_, i) => i + 1), [maxPassengers]);

  function clientCheck(): Record<string, string> {
    const e: Record<string, string> = {};
    const need = (key: keyof Fields, message: string) => {
      if (!String(fields[key]).trim()) e[key] = message;
    };
    if (category === "event") {
      need("eventTitle", "Tell us the event.");
      need("eventVenue", "Tell us the venue.");
      need("eventDate", "Choose the event date.");
    } else {
      need("serviceType", "Choose the type of journey.");
    }
    need("pickupAddress", "Enter the pickup address.");
    need("destinationAddress", "Enter the destination.");
    need("date", "Choose the pickup date.");
    need("time", "Choose the pickup time.");
    if (fields.returnJourney) {
      need("returnDate", "Choose the return date.");
      need("returnTime", "Choose the return pickup time.");
    }
    need("passengers", "Choose the number of passengers.");
    need("customerName", "Enter your name.");
    need("customerEmail", "Enter your email address.");
    need("customerPhone", "Enter your phone number.");
    if (!fields.termsAccepted) e.termsAccepted = "Please accept the terms to continue.";
    if (!fields.privacyAcknowledged) e.privacyAcknowledged = "Please confirm you have read the privacy notice.";
    return e;
  }

  function focusFirst(e: Record<string, string>) {
    const first = FIELD_ORDER.find((k) => e[k]);
    if (!first) return;
    const el = document.getElementById(id(first));
    // Design 3 time boxes are a wrapper around the selector button.
    (el?.matches("input, select, textarea, button") ? el : el?.querySelector<HTMLElement>("button, input"))?.focus();
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError("");
    const local = clientCheck();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFormError("Please check the highlighted fields.");
      focusFirst(local);
      return;
    }
    if (!token) {
      setFormError("Please wait for the security check to finish, then try again.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        category,
        customerName: fields.customerName,
        customerEmail: fields.customerEmail,
        customerPhone: fields.customerPhone,
        pickupAddress: fields.pickupAddress,
        ...(placeIds.pickup ? { pickupPlaceId: placeIds.pickup } : {}),
        destinationAddress: fields.destinationAddress,
        ...(placeIds.destination ? { destinationPlaceId: placeIds.destination } : {}),
        date: fields.date,
        time: fields.time,
        returnJourney: fields.returnJourney,
        ...(fields.returnJourney ? { returnDate: fields.returnDate, returnTime: fields.returnTime } : {}),
        passengers: Number(fields.passengers),
        ...(fields.luggage ? { luggage: fields.luggage } : {}),
        ...(fields.specialRequirements ? { specialRequirements: fields.specialRequirements } : {}),
        termsAccepted: fields.termsAccepted,
        privacyAcknowledged: fields.privacyAcknowledged,
        termsVersion: TERMS_LAST_UPDATED,
        turnstileToken: token,
        website: fields.website,
      };
      if (category === "event") {
        Object.assign(payload, {
          eventTitle: fields.eventTitle,
          eventVenue: fields.eventVenue,
          eventDate: fields.eventDate,
          groupVehicleRequested: fields.groupVehicleRequested,
          ...(event ? { eventId: event.id } : {}),
        });
      } else {
        Object.assign(payload, {
          serviceType: fields.serviceType,
          ...(fields.flightNumber ? { flightNumber: fields.flightNumber } : {}),
        });
      }
      const result = await submitBespokeRequest(payload);
      setReference(result.reference);
    } catch (e) {
      const problem = e instanceof BespokeRequestError ? e : null;
      setFormError(problem?.message ?? "Something went wrong. Please try again.");
      if (problem && Object.keys(problem.errors).length > 0) {
        setErrors(problem.errors);
        focusFirst(problem.errors);
      }
      // Tokens are single-use: get a fresh one for the next attempt.
      setToken("");
      setResetSignal((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div ref={successRef} tabIndex={-1} role="status" aria-live="polite" className="rounded-2xl outline-none border border-emerald/30 bg-emerald/10 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white">Thank you — we&apos;ve received your request</h2>
        <p className="mt-3 text-base leading-relaxed text-white/75">
          Your reference is <strong className="text-white">{reference}</strong>. We&apos;ve sent a copy to{" "}
          <strong className="text-white">{fields.customerEmail}</strong>.
        </p>
        <ol className="mt-5 space-y-2 text-sm leading-relaxed text-white/75">
          <li>1. We check availability for your date and group.</li>
          <li>2. We email you a personal quotation with a secure link.</li>
          <li>3. Your booking is confirmed only once you accept and pay online.</li>
        </ol>
        <p className="mt-5 text-sm text-white/60">
          Questions? Call {SITE.officeLandlineDisplay} or WhatsApp us quoting {reference}.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} data-bespoke-request-form className="space-y-8" aria-describedby={formError ? id("form-error") : undefined}>
      {formError ? (
        <p id={id("form-error")} role="alert" className="rounded-xl border border-red-300/60 bg-red-500/10 p-4 text-sm font-medium text-[#b42318]">
          {formError}
        </p>
      ) : null}

      {category === "event" ? (
        <fieldset className="space-y-4 rounded-2xl [&>legend+*]:clear-both border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <legend className="float-left mb-2 w-full text-lg font-bold text-white">Your event</legend>
          {listed && event ? (
            <div className="rounded-xl border border-emerald/30 bg-emerald/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{event.categoryLabel}</p>
              <p className="mt-1 text-lg font-bold text-white">{event.title}</p>
              <p className="mt-1 text-sm text-white/70">
                {event.venueName} · {formatUkDate(event.date)}
                {event.startTime ? ` · starts ${event.startTime}` : ""}
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className={labelClass} htmlFor={id("eventTitle")}>
                  Event
                </label>
                <input id={id("eventTitle")} className={inputClass} value={fields.eventTitle} maxLength={200} placeholder="e.g. concert, match or show name" onChange={(e) => set("eventTitle", e.target.value)} aria-invalid={Boolean(errors.eventTitle)} aria-describedby={describedBy("eventTitle")} />
                {err("eventTitle")}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={id("eventVenue")}>
                    Belfast venue
                  </label>
                  <input id={id("eventVenue")} className={inputClass} value={fields.eventVenue} maxLength={200} placeholder="e.g. The O2 Belfast" onChange={(e) => set("eventVenue", e.target.value)} aria-invalid={Boolean(errors.eventVenue)} aria-describedby={describedBy("eventVenue")} />
                  {err("eventVenue")}
                </div>
                <div>
                  <ScheduleField id={id("eventDate")} kind="date" label="Event date" value={fields.eventDate} onChange={(v) => { set("eventDate", v); if (!fields.date) set("date", v); }} design3={design3} invalid={Boolean(errors.eventDate)} describedBy={describedBy("eventDate")} />
                  {err("eventDate")}
                </div>
              </div>
            </>
          )}
          {errors.eventId ? <span className={errorClass} role="alert">{errors.eventId}</span> : null}
        </fieldset>
      ) : (
        <fieldset className="space-y-4 rounded-2xl [&>legend+*]:clear-both border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <legend className="float-left mb-2 w-full text-lg font-bold text-white">Your journey type</legend>
          <div>
            <label className={labelClass} htmlFor={id("serviceType")}>
              Type of journey
            </label>
            <select id={id("serviceType")} className={inputClass} value={fields.serviceType} onChange={(e) => set("serviceType", e.target.value)} aria-invalid={Boolean(errors.serviceType)} aria-describedby={describedBy("serviceType")}>
              <option value="">Choose…</option>
              {BUSINESS_CLASS_REQUEST_SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BUSINESS_CLASS_REQUEST_SERVICE_LABELS[t]}
                </option>
              ))}
            </select>
            {err("serviceType")}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-4 rounded-2xl [&>legend+*]:clear-both border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <legend className="float-left mb-2 w-full text-lg font-bold text-white">Journey</legend>
        <AddressInput
          id={id("pickupAddress")}
          name="pickupAddress"
          label="Pickup address"
          placeholder="Start typing your address or postcode"
          value={fields.pickupAddress}
          onChange={(value) => {
            set("pickupAddress", value.slice(0, 300));
            setPlaceIds((ids) => (ids.pickup ? { ...ids, pickup: "" } : ids));
          }}
          onSelectPlace={choosePlace("pickup")}
          selectionError={errors.pickupAddress || undefined}
          reserveHelperSpace={false}
        />
        <AddressInput
          id={id("destinationAddress")}
          name="destinationAddress"
          label="Destination"
          placeholder={category === "event" ? "The venue, or where you'd like dropping" : "Address, hotel or airport"}
          value={fields.destinationAddress}
          onChange={(value) => {
            set("destinationAddress", value.slice(0, 300));
            setPlaceIds((ids) => (ids.destination ? { ...ids, destination: "" } : ids));
          }}
          onSelectPlace={choosePlace("destination")}
          selectionError={errors.destinationAddress || undefined}
          reserveHelperSpace={false}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <ScheduleField id={id("date")} kind="date" label="Pickup date" value={fields.date} onChange={(v) => set("date", v)} design3={design3} invalid={Boolean(errors.date)} describedBy={describedBy("date")} />
            {err("date")}
          </div>
          <div>
            <ScheduleField id={id("time")} kind="time" label="Pickup time" value={fields.time} onChange={(v) => set("time", v)} design3={design3} invalid={Boolean(errors.time)} describedBy={describedBy("time")} />
            {err("time")}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-base text-white">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-emerald" checked={fields.returnJourney} onChange={(e) => set("returnJourney", e.target.checked)} />
          {category === "event" ? "Collect us after the event (return journey)" : "Add a return journey"}
        </label>
        {fields.returnJourney ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <ScheduleField id={id("returnDate")} kind="date" label="Return date" value={fields.returnDate} onChange={(v) => set("returnDate", v)} design3={design3} invalid={Boolean(errors.returnDate)} describedBy={describedBy("returnDate")} />
              {err("returnDate")}
            </div>
            <div>
              <ScheduleField id={id("returnTime")} kind="time" label="Return pickup time" value={fields.returnTime} onChange={(v) => set("returnTime", v)} design3={design3} invalid={Boolean(errors.returnTime)} describedBy={describedBy("returnTime", category === "event")} />
              {category === "event" ? (
                <span id={id("returnTime-hint")} className={hintClass}>
                  Your best guess is fine. We agree the exact meeting point and time with you.
                </span>
              ) : null}
              {err("returnTime")}
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={id("passengers")}>
              Passengers
            </label>
            <select id={id("passengers")} className={inputClass} value={fields.passengers} onChange={(e) => set("passengers", e.target.value)} aria-invalid={Boolean(errors.passengers)} aria-describedby={describedBy("passengers", true)}>
              <option value="">Choose…</option>
              {passengerOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <span id={id("passengers-hint")} className={hintClass}>
              {category === "business_class"
                ? `Business Class carries up to ${BUSINESS_CLASS_MAX_PASSENGERS} passengers.`
                : `Up to ${EVENT_REQUEST_MAX_PASSENGERS}. For 8 or more, please call ${SITE.officeLandlineDisplay}.`}
            </span>
            {err("passengers")}
          </div>
          {category === "business_class" ? (
            <div>
              <label className={labelClass} htmlFor={id("flightNumber")}>
                Flight number (optional)
              </label>
              <input id={id("flightNumber")} className={inputClass} value={fields.flightNumber} maxLength={10} placeholder="e.g. BA1426" autoCapitalize="characters" onChange={(e) => set("flightNumber", e.target.value)} aria-invalid={Boolean(errors.flightNumber)} aria-describedby={describedBy("flightNumber")} />
              {err("flightNumber")}
            </div>
          ) : null}
        </div>
        {showGroupOption ? (
          <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4" role="note">
            <p className="text-sm font-semibold text-white">7-seater requested</p>
            <p className="mt-1 text-sm leading-relaxed text-white/75">
              Groups of {GROUP_VEHICLE_FROM_PASSENGERS}–{EVENT_REQUEST_MAX_PASSENGERS} need our 7-seater, which is subject to
              availability. We confirm the vehicle in your quotation before you pay.
            </p>
          </div>
        ) : null}
        <div>
          <label className={labelClass} htmlFor={id("luggage")}>
            {category === "business_class" ? "Luggage (optional)" : "Bags or anything we should carry (optional)"}
          </label>
          <input id={id("luggage")} className={inputClass} value={fields.luggage} maxLength={300} placeholder={category === "business_class" ? "e.g. 2 suitcases, 1 cabin bag" : "e.g. a folding wheelchair"} onChange={(e) => set("luggage", e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id("specialRequirements")}>
            Anything else we should know (optional)
          </label>
          <textarea id={id("specialRequirements")} className={`${inputClass} min-h-28 resize-y`} value={fields.specialRequirements} maxLength={1000} placeholder={category === "event" ? "e.g. accessibility needs, child seats, a preferred meeting point" : "e.g. meeting arrangements, a name board, child seats"} onChange={(e) => set("specialRequirements", e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl [&>legend+*]:clear-both border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <legend className="float-left mb-2 w-full text-lg font-bold text-white">Your details</legend>
        <div>
          <label className={labelClass} htmlFor={id("customerName")}>
            Full name
          </label>
          <input id={id("customerName")} className={inputClass} value={fields.customerName} maxLength={100} autoComplete="name" onChange={(e) => set("customerName", e.target.value)} aria-invalid={Boolean(errors.customerName)} aria-describedby={describedBy("customerName")} />
          {err("customerName")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={id("customerEmail")}>
              Email
            </label>
            <input id={id("customerEmail")} type="email" inputMode="email" className={inputClass} value={fields.customerEmail} maxLength={254} autoComplete="email" onChange={(e) => set("customerEmail", e.target.value)} aria-invalid={Boolean(errors.customerEmail)} aria-describedby={describedBy("customerEmail")} />
            {err("customerEmail")}
          </div>
          <div>
            <label className={labelClass} htmlFor={id("customerPhone")}>
              Mobile number
            </label>
            <input id={id("customerPhone")} type="tel" inputMode="tel" className={inputClass} value={fields.customerPhone} maxLength={30} autoComplete="tel" onChange={(e) => set("customerPhone", e.target.value)} aria-invalid={Boolean(errors.customerPhone)} aria-describedby={describedBy("customerPhone")} />
            {err("customerPhone")}
          </div>
        </div>
        {/* Honeypot: hidden from people and screen readers. */}
        <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={fields.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-white/80" htmlFor={id("termsAccepted")}>
          <input id={id("termsAccepted")} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald" checked={fields.termsAccepted} onChange={(e) => set("termsAccepted", e.target.checked)} aria-invalid={Boolean(errors.termsAccepted)} aria-describedby={describedBy("termsAccepted")} />
          <span>
            I accept the{" "}
            <Link href="/terms/" className="text-emerald underline" target="_blank">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/cancellation/" className="text-emerald underline" target="_blank">
              cancellation policy
            </Link>
            .
          </span>
        </label>
        {err("termsAccepted")}
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-white/80" htmlFor={id("privacyAcknowledged")}>
          <input id={id("privacyAcknowledged")} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald" checked={fields.privacyAcknowledged} onChange={(e) => set("privacyAcknowledged", e.target.checked)} aria-invalid={Boolean(errors.privacyAcknowledged)} aria-describedby={describedBy("privacyAcknowledged")} />
          <span>
            I have read the{" "}
            <Link href="/privacy/" className="text-emerald underline" target="_blank">
              privacy notice
            </Link>
            . We use your details only to reply to this request.
          </span>
        </label>
        {err("privacyAcknowledged")}
      </fieldset>

      <div className="space-y-4">
        <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action={BESPOKE_TURNSTILE_ACTION} onToken={setToken} resetSignal={resetSignal} />
        <button
          type="submit"
          disabled={submitting || !onlineAvailable}
          className="btn-primary inline-flex min-h-12 w-full items-center justify-center rounded-xl px-6 py-3 text-base font-bold disabled:opacity-60 sm:w-auto"
        >
          {submitting ? "Sending your request…" : "Send request"}
        </button>
        <p className="text-sm text-white/55">
          No payment now. We reply with a personal quotation; your booking is confirmed only when you accept and pay online.
        </p>
      </div>
    </form>
  );
}
