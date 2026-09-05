"use client";

import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";

/**
 * Compact secondary contact line under the quote CTA.
 * Muted “Need help?” + WhatsApp + email — no phone buttons.
 */
export default function QuoteHelpContact({ className = "" }: { className?: string }) {
  return (
    <p
      className={`mt-3 px-1 text-center text-sm leading-relaxed quote-secondary md:mt-4 ${className}`}
    >
      <span className="text-white/55">Need help? Contact us via</span>
      {" "}
      <a
        href={whatsAppChatUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-emerald underline-offset-2 transition-colors hover:text-emerald-light hover:underline"
      >
        WhatsApp
      </a>
      <span className="text-white/40"> or </span>
      <a
        href={`mailto:${SITE.email}`}
        className="font-medium text-emerald underline-offset-2 transition-colors hover:text-emerald-light hover:underline"
      >
        email
      </a>
      <span className="text-white/55">.</span>
    </p>
  );
}
