"use client";

import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import { DEFAULT_GOOGLE_REVIEW_URL, GOOGLE_BUSINESS_PROFILE_URL } from "../../shared/google-business-profile";

/** Footer contact: email, WhatsApp and a Contact link. The phone number is on the Contact page only (owner, 17 Nov 2026). */
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
        <a href="/contact/" className="transition-colors hover:text-emerald" data-footer-contact-link>
          Contact us
        </a>
      </li>
      <li>
        <a
          href={GOOGLE_BUSINESS_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-emerald"
        >
          <span data-reviews-stars aria-hidden="true">
            ★
          </span>{" "}
          Read our Google reviews
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
