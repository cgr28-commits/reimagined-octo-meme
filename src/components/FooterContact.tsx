"use client";

import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import { DEFAULT_GOOGLE_REVIEW_URL, GOOGLE_BUSINESS_PROFILE_URL } from "../../shared/google-business-profile";

export default function FooterContact() {
  return (
    <ul className="mt-4 space-y-3 text-sm text-white/50">
      <li>
        <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-emerald">
          {SITE.email}
        </a>
      </li>
      <li>
        <a
          href={whatsAppChatUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-emerald"
        >
          WhatsApp @{SITE.whatsappUsername}
        </a>
      </li>
      <li>
        <a href={`tel:${SITE.landline}`} className="transition-colors hover:text-emerald">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-white/55">
            Call or WhatsApp
          </span>
          {SITE.landlineDisplay}
        </a>
      </li>
      <li>
        <a
          href={GOOGLE_BUSINESS_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-emerald"
        >
          ★ Read our Google reviews
        </a>
        <span className="text-white/30"> · </span>
        <a
          href={DEFAULT_GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-emerald"
        >
          Leave a review
        </a>
      </li>
    </ul>
  );
}
