"use client";

import { FormEvent, useState } from "react";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import { isValidEmailAddress, isValidMobileNumber } from "@/lib/booking-message";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import { SITE } from "@/lib/data";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import {
  openWhatsAppBookingMessage,
  submitEnquiryByEmail,
  submitMobileWhatsAppEnquiry,
} from "@/lib/submit-booking";
import {
  buildTourEnquiryMessage,
  type TourEnquiryDetails,
} from "@/lib/tour-enquiry-message";

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30";

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/10 py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-white/45">{label}</dt>
      <dd className="text-sm text-white sm:max-w-[65%] sm:text-right">{value}</dd>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type TourBookingFormProps = {
  tourTitle: string;
  heading?: string;
  description?: string;
  id?: string;
  centered?: boolean;
};

type EnquiryDelivery = "whatsapp" | "email";

export default function TourBookingForm({
  tourTitle,
  heading = "Book this day trip",
  description,
  id,
  centered = false,
}: TourBookingFormProps) {
  const isMobileDevice = useIsMobileDevice();
  const usesWhatsApp = isMobileDevice === true;
  const usesEmail = isMobileDevice !== true;

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [groupSize, setGroupSize] = useState(2);
  const [pickupLocation, setPickupLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [enquirySent, setEnquirySent] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [enquiryDelivery, setEnquiryDelivery] = useState<EnquiryDelivery | null>(null);
  const [emailAddressError, setEmailAddressError] = useState("");
  const [mobileNumberError, setMobileNumberError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const defaultDescription = usesWhatsApp
    ? "Fill in your details, review them, then send via WhatsApp or email."
    : "Fill in your details, review them, then confirm your day trip booking.";

  function validateEmail(required: boolean): boolean {
    if (!required && !customerEmail.trim()) {
      setEmailAddressError("");
      return true;
    }

    if (!customerEmail.trim()) {
      setEmailAddressError("Please enter your email address so we can confirm your booking.");
      return false;
    }
    if (!isValidEmailAddress(customerEmail)) {
      setEmailAddressError("Please enter a valid email address.");
      return false;
    }

    setEmailAddressError("");
    return true;
  }

  function buildDetails(): TourEnquiryDetails {
    return {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      mobileNumber: customerMobile.trim(),
      tourTitle,
      travelDate,
      groupSize,
      pickupLocation: pickupLocation.trim(),
      notes: notes.trim(),
    };
  }

  function buildConfirmedDetails(): TourEnquiryDetails {
    return {
      ...buildDetails(),
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: TERMS_LAST_UPDATED,
      ...buildMarketingOptInFields(marketingOptIn),
    };
  }

  function requireTermsAccepted(): boolean {
    if (!termsAccepted) {
      setTermsError("Please accept the Terms & Conditions before continuing.");
      return false;
    }

    setTermsError("");
    return true;
  }

  function validateForm(): boolean {
    if (!customerName.trim()) {
      return false;
    }
    if (!travelDate) {
      return false;
    }
    if (!pickupLocation.trim()) {
      return false;
    }

    const onDesktop = !(isMobileDevice ?? detectMobileDevice());

    if (!customerMobile.trim()) {
      setMobileNumberError("Please enter your mobile number so we can send your payment link by text.");
      return false;
    }
    if (!isValidMobileNumber(customerMobile)) {
      setMobileNumberError("Please enter a valid mobile number.");
      return false;
    }

    if (onDesktop) {
      if (!validateEmail(true)) {
        return false;
      }
    }

    setEmailAddressError("");
    setMobileNumberError("");
    return true;
  }

  async function confirmEnquiry(delivery: EnquiryDelivery) {
    if (!requireTermsAccepted()) {
      return;
    }

    const details = buildConfirmedDetails();
    const isMobile = isMobileDevice ?? detectMobileDevice();

    if (delivery === "email" && !validateEmail(true)) {
      return;
    }

    setSubmitted(true);
    setSubmitError("");
    setBookingReference("");

    let reference = "";
    try {
      const submission = {
        customerName: details.customerName,
        message: buildTourEnquiryMessage(details),
        subject: `New day trip booking — ${details.customerName}`,
        tour: details,
      };
      if (!isMobile || delivery === "email") {
        reference = await submitEnquiryByEmail(submission);
      } else {
        reference = await submitMobileWhatsAppEnquiry(submission);
      }
      setBookingReference(reference);
    } catch (error) {
      console.error("Tour enquiry submission failed", error);
      setSubmitError(
        delivery === "email" || !isMobile
          ? `We couldn't send your booking by email. Please try WhatsApp or contact ${SITE.email}.`
          : `We couldn't log your booking. Please try email instead or contact ${SITE.email}.`,
      );
      setSubmitted(false);
      return;
    }

    setEnquiryDelivery(delivery);
    setShowPreview(false);
    setEnquirySent(true);
    setSubmitted(false);

    if (details.marketingOptIn) {
      void recordMarketingOptIn({
        email: details.customerEmail,
        name: details.customerName,
        source: "tour-enquiry",
        fields: details,
      });
    }

    if (isMobile && delivery === "whatsapp") {
      openWhatsAppBookingMessage(buildTourEnquiryMessage(details, reference));
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setEnquirySent(false);
    setBookingReference("");
    setEnquiryDelivery(null);

    if (!validateForm()) {
      return;
    }

    if (!showPreview) {
      setShowPreview(true);
      return;
    }

    if (!requireTermsAccepted()) {
      return;
    }

    if (!usesWhatsApp) {
      void confirmEnquiry("email");
    }
  }

  const submitInProgressLabel = "Sending booking…";

  const confirmLabel = "Confirm & book";
  const whatsAppConfirmLabel = "Confirm & send via WhatsApp";
  const reviewLabel = usesWhatsApp ? "Review booking" : "Review booking";

  return (
    <div
      id={id}
      className={`glass-card rounded-2xl p-6 sm:p-8 ${centered ? "text-center" : ""}`}
    >
      <h2 className={`text-lg font-bold text-white sm:text-xl ${centered ? "sm:text-2xl" : ""}`}>
        {heading}
      </h2>
      <p className={`mt-3 text-sm leading-relaxed text-white/65 ${centered ? "mx-auto max-w-2xl" : ""}`}>
        {description ?? defaultDescription}
      </p>

      <form onSubmit={handleSubmit} className={`mt-6 space-y-4 ${centered ? "text-left" : ""}`}>
        <div>
          <label htmlFor={`tour-name-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Your Name
          </label>
          <input
            id={`tour-name-${id ?? "form"}`}
            type="text"
            required
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setShowPreview(false);
              setEnquirySent(false);
              setBookingReference("");
            }}
            placeholder="John Smith"
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor={`tour-mobile-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Mobile Number
          </label>
          <input
            id={`tour-mobile-${id ?? "form"}`}
            type="tel"
            required
            autoComplete="tel"
            value={customerMobile}
            onChange={(e) => {
              setCustomerMobile(e.target.value);
              setShowPreview(false);
              setEnquirySent(false);
              setBookingReference("");
              setMobileNumberError("");
            }}
            placeholder="07xxx xxxxxx"
            className={inputClassName}
          />
          <p className="mt-1.5 text-xs text-white/40">
            We&apos;ll send your payment link here by text or WhatsApp.
          </p>
          {mobileNumberError && (
            <p className="mt-1.5 text-xs text-red-300">{mobileNumberError}</p>
          )}
        </div>

        <div>
          <label htmlFor={`tour-email-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Email Address
          </label>
          <input
            id={`tour-email-${id ?? "form"}`}
            type="email"
            required={usesEmail}
            autoComplete="email"
            value={customerEmail}
            onChange={(e) => {
              setCustomerEmail(e.target.value);
              setShowPreview(false);
              setEnquirySent(false);
              setBookingReference("");
              setEmailAddressError("");
            }}
            placeholder="you@example.com"
            className={inputClassName}
          />
          <p className="mt-1.5 text-xs text-white/40">
            {usesWhatsApp
              ? "Required if you send your booking by email."
              : "So we can email your booking confirmation."}
          </p>
          {emailAddressError && (
            <p className="mt-1.5 text-xs text-red-300">{emailAddressError}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`tour-date-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Preferred Date
            </label>
            <input
              id={`tour-date-${id ?? "form"}`}
              type="date"
              required
              value={travelDate}
              onChange={(e) => {
                setTravelDate(e.target.value);
                setShowPreview(false);
                setEnquirySent(false);
              setBookingReference("");
              }}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor={`tour-group-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Group Size
            </label>
            <select
              id={`tour-group-${id ?? "form"}`}
              required
              value={groupSize}
              onChange={(e) => {
                setGroupSize(Number(e.target.value));
                setShowPreview(false);
                setEnquirySent(false);
              setBookingReference("");
              }}
              className={inputClassName}
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((size) => (
                <option key={size} value={size}>
                  {size} {size === 1 ? "person" : "people"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={`tour-pickup-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Pickup Location
          </label>
          <input
            id={`tour-pickup-${id ?? "form"}`}
            type="text"
            required
            value={pickupLocation}
            onChange={(e) => {
              setPickupLocation(e.target.value);
              setShowPreview(false);
              setEnquirySent(false);
              setBookingReference("");
            }}
            placeholder="Hotel, address, or cruise terminal"
            className={inputClassName}
          />
        </div>

        <div>
          <label htmlFor={`tour-notes-${id ?? "form"}`} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Notes <span className="normal-case text-white/35">(optional)</span>
          </label>
          <textarea
            id={`tour-notes-${id ?? "form"}`}
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setShowPreview(false);
              setEnquirySent(false);
              setBookingReference("");
            }}
            placeholder="Any special requests or places you'd like to visit"
            className={`${inputClassName} resize-y`}
          />
        </div>

        {showPreview && (
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-4 sm:px-5">
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Review your day trip
              </p>
              <p className="mt-1 text-sm text-white/60">
                Please check everything is correct before submitting.
              </p>
            </div>
            <dl>
              <PreviewRow label="Day trip" value={tourTitle} />
              <PreviewRow label="Name" value={customerName.trim()} />
              <PreviewRow label="Mobile" value={customerMobile.trim()} />
              {isMobileDevice !== true && customerEmail.trim() && (
                <PreviewRow label="Email" value={customerEmail.trim()} />
              )}
              <PreviewRow label="Preferred date" value={travelDate} />
              <PreviewRow label="Group size" value={String(groupSize)} />
              <PreviewRow label="Pickup" value={pickupLocation.trim()} />
              {notes.trim() && <PreviewRow label="Notes" value={notes.trim()} />}
            </dl>
          </div>
        )}

        {submitError && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {submitError}
          </p>
        )}

        {enquirySent && (
          <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4 text-sm text-white">
            <p className="font-semibold">
              Booking sent{bookingReference ? ` — reference ${bookingReference}` : ""}
            </p>
            <p className="mt-2 text-white/80">
              You will be sent a payment link shortly via text. Your booking is not confirmed until
              full payment is made.
            </p>
            {enquiryDelivery === "whatsapp" && (
              <p className="mt-2 text-white/60">
                Your day trip enquiry should open in WhatsApp. If it didn&apos;t, tap the green chat
                button at the bottom of the screen.
              </p>
            )}
            {enquiryDelivery === "email" && customerEmail.trim() && (
              <p className="mt-2 text-white/60">
                Your booking has been sent by email. We&apos;ll confirm at {customerEmail.trim()}.
              </p>
            )}
          </div>
        )}

        {showPreview ? (
          usesWhatsApp ? (
            <div className="space-y-3">
              <BookingTermsConsent
                accepted={termsAccepted}
                onAcceptedChange={(checked) => {
                  setTermsAccepted(checked);
                  if (checked) {
                    setTermsError("");
                  }
                }}
                error={termsError}
                mode="booking-request"
              />
              <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
              <p className="text-xs text-white/55">Choose how to send your booking:</p>
              <button
                type="button"
                onClick={() => {
                  setShowPreview(false);
                  setSubmitError("");
                  setEnquirySent(false);
                  setBookingReference("");
                  setEnquiryDelivery(null);
                  setTermsAccepted(false);
                  setTermsError("");
                  setMarketingOptIn(false);
                }}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Edit details
              </button>
              <button
                type="button"
                disabled={submitted || !termsAccepted}
                onClick={() => void confirmEnquiry("whatsapp")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {usesWhatsApp && !submitted && <WhatsAppIcon className="h-5 w-5" />}
                {submitted ? submitInProgressLabel : whatsAppConfirmLabel}
              </button>
              <button
                type="button"
                disabled={submitted || !termsAccepted}
                onClick={() => void confirmEnquiry("email")}
                className="w-full rounded-xl border border-white/20 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:border-emerald/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitted ? submitInProgressLabel : "Send booking via email"}
              </button>
              <p className="text-xs leading-relaxed text-white/45">
                No WhatsApp? Email works too
                {customerEmail.trim() ? ` — we'll confirm at ${customerEmail.trim()}.` : " — enter your email above."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <BookingTermsConsent
                accepted={termsAccepted}
                onAcceptedChange={(checked) => {
                  setTermsAccepted(checked);
                  if (checked) {
                    setTermsError("");
                  }
                }}
                error={termsError}
                mode="booking-request"
              />
              <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreview(false);
                    setSubmitError("");
                    setEnquirySent(false);
                    setBookingReference("");
                    setEnquiryDelivery(null);
                    setTermsAccepted(false);
                    setTermsError("");
                    setMarketingOptIn(false);
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Edit details
                </button>
                <button
                  type="submit"
                  disabled={submitted || !termsAccepted}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : confirmLabel}
                </button>
              </div>
            </div>
          )
        ) : (
          <button
            type="submit"
            disabled={submitted}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70 ${centered ? "sm:w-auto" : ""}`}
          >
            {usesWhatsApp && !submitted && <WhatsAppIcon className="h-5 w-5" />}
            {submitted ? submitInProgressLabel : reviewLabel}
          </button>
        )}
      </form>
    </div>
  );
}
