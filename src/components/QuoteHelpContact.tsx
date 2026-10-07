"use client";

import { whatsAppChatUrl } from "@/lib/contact-card";
import {
  QUOTE_RESULT_ACTION_CLASS,
  QuoteResultActionIcon,
} from "@/components/quote-result-action";

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
        className={`quote-help-contact ${QUOTE_RESULT_ACTION_CLASS} ${className}`}
      >
        <QuoteResultActionIcon name="whatsapp" />
        <span className="text-[0.8125rem] font-bold leading-tight">Need help?</span>
        <span className="text-[0.7rem] font-medium leading-tight text-white/75">WhatsApp us</span>
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
