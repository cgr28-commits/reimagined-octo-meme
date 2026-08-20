"use client";

import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";

export default function FooterContact() {
  return (
    <ul className="mt-4 space-y-3 text-sm text-white/50">
      <li>
        <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-emerald">
          {SITE.email}
        </a>
      </li>
      <li>
        <span className="block text-xs font-semibold uppercase tracking-wider text-white/35">
          Business Line
        </span>
        <a
          href={`tel:${SITE.landline}`}
          className="mt-1 inline-block transition-colors hover:text-emerald"
        >
          {SITE.landlineDisplay}
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
    </ul>
  );
}
