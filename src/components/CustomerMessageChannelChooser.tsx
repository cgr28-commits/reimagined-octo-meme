"use client";

import { useEffect } from "react";
import {
  buildCustomerSmsHref,
  buildCustomerWhatsAppHref,
} from "../../shared/customer-message-channel";

export type CustomerMessageOffer = {
  key: string;
  title: string;
  message: string;
  mobile: string;
};

type CustomerMessageChannelChooserProps = {
  offer: CustomerMessageOffer;
  onClose: () => void;
  onOpened: (channel: "whatsapp" | "sms") => void;
};

function openWhatsApp(href: string) {
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(href);
  }
}

/**
 * WhatsApp / Text Message / Cancel for one already-built customer message.
 * Choosing a channel only opens the phone composer.
 */
export default function CustomerMessageChannelChooser({
  offer,
  onClose,
  onOpened,
}: CustomerMessageChannelChooserProps) {
  const whatsAppHref = buildCustomerWhatsAppHref(offer.mobile, offer.message);
  const smsHref = buildCustomerSmsHref(offer.mobile, offer.message);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-message-channel-title"
        data-customer-message-channel
        className="w-full max-w-md rounded-2xl border border-white/15 bg-navy p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="customer-message-channel-title" className="text-base font-bold text-white">
          {offer.title}
        </p>
        <p className="mt-1 text-sm text-white/70">Send via</p>
        <p className="mt-1 text-xs leading-relaxed text-white/50">
          Opens your phone with the message filled in. Nothing is sent until you press Send.
        </p>
        {!whatsAppHref || !smsHref ? (
          <p className="mt-3 text-sm text-amber-100" data-customer-message-no-mobile>
            No customer mobile number on this booking.
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!whatsAppHref}
            data-customer-message-whatsapp
            aria-label="Send via WhatsApp"
            onClick={() => {
              if (!whatsAppHref) return;
              openWhatsApp(whatsAppHref);
              onOpened("whatsapp");
            }}
            className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-base font-bold text-navy disabled:opacity-40"
          >
            WhatsApp
          </button>
          {smsHref ? (
            <a
              href={smsHref}
              data-customer-message-sms
              aria-label="Send via text message"
              onClick={() => {
                window.setTimeout(() => onOpened("sms"), 300);
              }}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-bold text-navy"
            >
              Text Message
            </a>
          ) : (
            <button
              type="button"
              disabled
              data-customer-message-sms
              aria-label="Send via text message"
              className="min-h-12 w-full rounded-xl bg-white px-4 py-3 text-base font-bold text-navy disabled:opacity-40"
            >
              Text Message
            </button>
          )}
          <button
            type="button"
            data-customer-message-cancel
            aria-label="Cancel"
            onClick={onClose}
            className="min-h-12 w-full rounded-xl border border-white/20 px-4 py-3 text-base font-semibold text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
