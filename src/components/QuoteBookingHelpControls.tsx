"use client";

import React, { useId } from "react";
import {
  BOOKING_HELP_WHATSAPP_MESSAGE,
  bookingHelpWhatsAppUrl,
} from "@/lib/booking-help-whatsapp";

type WhatsAppHelpProps = {
  onWhatsAppClick?: () => void;
  whatsappHref?: string;
};

/** Error-only WhatsApp booking help — never includes customer data in the message. */
export function BookingErrorWhatsAppHelp({
  onWhatsAppClick,
  whatsappHref = bookingHelpWhatsAppUrl(BOOKING_HELP_WHATSAPP_MESSAGE),
}: WhatsAppHelpProps) {
  return (
    <div
      className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4 text-left"
      role="region"
      aria-label="WhatsApp booking help"
      data-booking-error-whatsapp-help
    >
      <p className="text-sm font-semibold text-white">Need help completing your booking?</p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/75">
        Message us on WhatsApp and we’ll help you complete your online booking.
      </p>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onWhatsAppClick}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald/50 bg-navy-dark/50 px-4 py-3 text-sm font-semibold text-emerald transition-colors hover:border-emerald hover:bg-emerald/15 sm:w-auto"
      >
        Get Booking Help on WhatsApp
      </a>
    </div>
  );
}

type StartNewQuoteControlsProps = {
  confirmOpen: boolean;
  onRequestStart: () => void;
  onCancelConfirm: () => void;
  onConfirmStart: () => void;
  /** Stable ids for tests; defaults to React useId() so they stay unique per instance. */
  titleId?: string;
  descId?: string;
};

/**
 * Clear Details & Start a New Quote — confirmation dialog uses unique ids so
 * only one instance should be mounted in the page at a time.
 */
export function StartNewQuoteControls({
  confirmOpen,
  onRequestStart,
  onCancelConfirm,
  onConfirmStart,
  titleId: titleIdProp,
  descId: descIdProp,
}: StartNewQuoteControlsProps) {
  const reactTitleId = useId();
  const reactDescId = useId();
  const titleId = titleIdProp ?? reactTitleId;
  const descId = descIdProp ?? reactDescId;

  if (confirmOpen) {
    return (
      <div
        className="rounded-xl border border-white/20 bg-navy-dark/60 px-4 py-4 text-center"
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-start-new-quote-confirm
      >
        <p id={titleId} className="text-sm font-semibold text-white">
          Need a quote for a different journey?
        </p>
        <p id={descId} className="quote-secondary mt-2 text-sm leading-relaxed">
          This will clear your current journey details and start a new quote. Continue?
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onCancelConfirm}
            className="rounded-xl border border-white/25 bg-transparent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
          >
            Keep Current Quote
          </button>
          <button
            type="button"
            onClick={onConfirmStart}
            className="rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy"
          >
            Start New Quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-center" data-start-new-quote-controls>
      <p className="text-sm text-white/70">Need a quote for a different journey?</p>
      <button
        type="button"
        onClick={onRequestStart}
        className="w-full rounded-xl border border-white/30 bg-transparent px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-emerald/50 hover:bg-white/5"
      >
        Clear Details &amp; Start a New Quote
      </button>
    </div>
  );
}

type BookingErrorHelpClusterProps = WhatsAppHelpProps & StartNewQuoteControlsProps;

/** WhatsApp help + Start New Quote shown together beside the active booking error. */
export function BookingErrorHelpCluster(props: BookingErrorHelpClusterProps) {
  const {
    onWhatsAppClick,
    whatsappHref,
    confirmOpen,
    onRequestStart,
    onCancelConfirm,
    onConfirmStart,
    titleId,
    descId,
  } = props;
  return (
    <div className="space-y-3" data-booking-error-help-cluster>
      <BookingErrorWhatsAppHelp
        onWhatsAppClick={onWhatsAppClick}
        whatsappHref={whatsappHref}
      />
      <StartNewQuoteControls
        confirmOpen={confirmOpen}
        onRequestStart={onRequestStart}
        onCancelConfirm={onCancelConfirm}
        onConfirmStart={onConfirmStart}
        titleId={titleId}
        descId={descId}
      />
    </div>
  );
}
