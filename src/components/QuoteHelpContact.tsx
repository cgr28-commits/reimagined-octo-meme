"use client";

import { whatsAppChatUrl } from "@/lib/contact-card";

/**
 * Compact secondary contact line under the quote CTA.
 * Muted “Need help?” + emerald WhatsApp — no landline CTA.
 */
export default function QuoteHelpContact({ className = "" }: { className?: string }) {
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
