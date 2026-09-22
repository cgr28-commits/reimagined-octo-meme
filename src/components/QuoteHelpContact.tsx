"use client";

import { whatsAppChatUrl } from "@/lib/contact-card";

/**
 * Compact secondary contact line under the quote CTA.
 * Muted “Need help?” + emerald WhatsApp — no landline CTA.
 */
export default function QuoteHelpContact({ className = "" }: { className?: string }) {
  return (
    <p
      className={`mt-2 px-1 text-center text-[0.8125rem] leading-relaxed quote-secondary md:mt-4 md:text-sm ${className}`}
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
