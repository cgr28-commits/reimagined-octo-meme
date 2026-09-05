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
