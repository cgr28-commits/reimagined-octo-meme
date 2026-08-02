"use client";

import { SITE } from "@/lib/data";
import { useIsMobileDevice } from "@/lib/device";

export default function FooterContact() {
  const isMobile = useIsMobileDevice();

  return (
    <ul className="mt-4 space-y-3 text-sm text-white/50">
      <li>
        <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-emerald">
          {SITE.email}
        </a>
      </li>
      {isMobile === false && (
        <li>
          <a href={`tel:${SITE.landline}`} className="transition-colors hover:text-emerald">
            {SITE.landlineDisplay}
          </a>
        </li>
      )}
      {isMobile === true && (
        <li>
          <a
            href={`https://wa.me/${SITE.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-emerald"
          >
            WhatsApp Us
          </a>
        </li>
      )}
    </ul>
  );
}
