"use client";

import { whatsAppChatUrl } from "@/lib/contact-card";

/**
 * Compact secondary contact line under the quote CTA.
 * Muted “Need help?” + emerald WhatsApp — no landline CTA.
 */
export default function QuoteHelpContact({
  className = "",
  variant = "inline",
}: {
  className?: string;
  variant?: "inline" | "card";
}) {
  if (variant === "card") {
    return (
      <a
        href={whatsAppChatUrl()}
        target="_blank"
        rel="noopener noreferrer"
        data-quote-help-card
        className={`quote-help-contact flex min-h-[4.25rem] flex-col items-center justify-center rounded-2xl border border-white/80 bg-white px-2 py-2 text-center text-navy shadow-sm ${className}`}
      >
        <span className="text-sm font-bold leading-tight">Need help?</span>
        <span className="mt-0.5 text-xs font-medium leading-tight">WhatsApp us</span>
      </a>
    );
  }
  return (
    <p
      className={`quote-help-contact mt-1 px-1 text-center text-[0.8125rem] font-medium leading-snug text-white md:mt-2 md:text-sm ${className}`}
    >
      <span>Need help?</span>
      {" "}
      <a
        href={whatsAppChatUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-emerald underline-offset-2 transition-colors hover:text-emerald-light hover:underline"
      >
        WhatsApp us
      </a>
    </p>
  );
}
