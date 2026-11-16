"use client";

import { openCookieSettings } from "@/lib/cookie-consent";

export default function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie Settings
    </button>
  );
}
