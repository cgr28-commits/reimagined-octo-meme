"use client";

import {
  ownerCustomerContactActions,
  type OwnerNavPoint,
} from "../../shared/owner-job-actions";

export function OwnerWazeAddressLink({
  kind,
  point,
}: {
  kind: "pickup" | "destination";
  point: OwnerNavPoint;
}) {
  const text = point.label || "—";
  if (!point.wazeHref) {
    return <span className="break-words">{text}</span>;
  }
  return (
    <a
      href={point.wazeHref}
      target="_blank"
      rel="noopener noreferrer"
      data-owner-waze={kind}
      className="inline-flex min-h-11 w-full items-start gap-1.5 rounded-md py-1.5 text-sm font-medium text-white underline-offset-2 hover:underline"
    >
      <span className="min-w-0 flex-1 break-words leading-snug">{text}</span>
      <span
        className="mt-0.5 shrink-0 rounded border border-[#33ccff]/45 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#33ccff]"
        aria-hidden
      >
        Waze
      </span>
      <span className="sr-only"> Open {kind} in Waze</span>
    </a>
  );
}

export function OwnerCustomerCallWhatsApp({
  phone,
  tone = "light",
}: {
  phone?: string | null;
  tone?: "light" | "muted";
}) {
  const contact = ownerCustomerContactActions(phone);
  if (!contact) return null;
  const actionClass =
    tone === "muted"
      ? "inline-flex min-h-11 items-center font-semibold text-emerald-light"
      : "inline-flex min-h-11 items-center font-semibold text-emerald";
  return (
    <div
      data-owner-customer-contact
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0 text-sm"
    >
      <span className="tabular-nums text-white">{contact.display}</span>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <a href={contact.telHref} data-owner-call className={actionClass}>
        Call
      </a>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <a
        href={contact.whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        data-owner-whatsapp
        className={actionClass}
      >
        WhatsApp
      </a>
    </div>
  );
}
