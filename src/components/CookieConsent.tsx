"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  COOKIE_SETTINGS_OPEN_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { updateGoogleConsent } from "@/lib/google-ads-client";

// Owner (16 Nov 2026): a full-screen consent pop-up, like the big sites use —
// the page is dimmed and can't be used until the customer chooses Accept all
// or Decline all. Both choices let them straight in (declining never blocks
// a quote or booking). Owner/driver/admin screens don't show it.
const HIDDEN_PATH_PREFIXES = ["/owner", "/driver", "/driver-portal", "/driver-accept", "/admin"];

export default function CookieConsent() {
  const pathname = usePathname() ?? "/";
  const [choice, setChoice] = useState<CookieConsentChoice | null | "loading">("loading");
  const [reopened, setReopened] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [marketingOn, setMarketingOn] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readCookieConsent();
    setChoice(stored);
    setMarketingOn(stored === "accepted");
    const open = () => {
      const current = readCookieConsent();
      setMarketingOn(current === "accepted");
      setShowDetails(true);
      setReopened(true);
    };
    window.addEventListener(COOKIE_SETTINGS_OPEN_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_OPEN_EVENT, open);
  }, []);

  const hiddenHere = HIDDEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const visible = choice !== "loading" && !hiddenHere && (choice === null || reopened);

  // Lock the page behind the pop-up and keep keyboard focus inside it.
  useEffect(() => {
    if (!visible) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    html.setAttribute("data-cookie-wall", "");
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("[data-cookie-accept]")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prevOverflow;
      html.removeAttribute("data-cookie-wall");
      document.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  if (!visible) return null;

  function choose(next: CookieConsentChoice) {
    writeCookieConsent(next);
    updateGoogleConsent(next === "accepted");
    setChoice(next);
    setMarketingOn(next === "accepted");
    setReopened(false);
    setShowDetails(false);
  }

  return (
    <div className="cookie-wall" data-cookie-consent-overlay>
      <div
        ref={dialogRef}
        className="cookie-wall-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-wall-title"
        aria-describedby="cookie-wall-body"
      >
        <h2 id="cookie-wall-title" className="cookie-wall-title">
          Your privacy and how we use your data
        </h2>
        <div id="cookie-wall-body" className="cookie-wall-body">
          <p>
            My Airport Taxi NI and our selected partners use cookies, local storage and similar
            technologies to store and access information on your device and to process personal
            data, such as your IP address, online identifiers, device characteristics and browsing
            interactions. Strictly necessary technologies are used to deliver our quotation, booking
            and payment services and cannot be switched off.
          </p>
          <p>
            Subject to your consent, our advertising partner{" "}
            <span className="cookie-wall-strong">Google (Google Ads)</span> may also process this data
            for advertising and conversion measurement, audience insights, attribution of the
            advertisement that referred you to us, and service improvement. Declining optional
            cookies will not affect your ability to obtain a quote or make a booking. Your choice
            applies to this website only, and you may withdraw or change your consent at any time
            via <span className="cookie-wall-strong">Cookie Settings</span> at the foot of every page.
            For further information, please read our{" "}
            <Link href="/privacy/" className="cookie-wall-link">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        {showDetails ? (
          <div className="cookie-wall-details" data-cookie-details>
            <div className="cookie-wall-category">
              <div>
                <p className="cookie-wall-category-name">Strictly necessary</p>
                <p className="cookie-wall-category-text">
                  Required for quotes, bookings, secure card payments (Stripe), address look-up and to
                  remember your cookie choice.
                </p>
              </div>
              <span className="cookie-wall-always">Always on</span>
            </div>
            <label className="cookie-wall-category">
              <div>
                <p className="cookie-wall-category-name">Advertising &amp; measurement</p>
                <p className="cookie-wall-category-text">
                  Google Ads conversion tracking, ad attribution and anonymised website usage
                  insights that help us keep our fares down.
                </p>
              </div>
              <input
                type="checkbox"
                role="switch"
                className="cookie-wall-switch"
                checked={marketingOn}
                onChange={(e) => setMarketingOn(e.target.checked)}
                aria-label="Advertising and measurement cookies"
              />
            </label>
          </div>
        ) : null}

        <div className="cookie-wall-actions">
          <button type="button" data-cookie-accept className="cookie-wall-btn cookie-wall-btn--accept" onClick={() => choose("accepted")}>
            Accept all
          </button>
          <button type="button" className="cookie-wall-btn cookie-wall-btn--decline" onClick={() => choose("rejected")}>
            Decline all
          </button>
          {showDetails ? (
            <button
              type="button"
              className="cookie-wall-details-toggle"
              onClick={() => choose(marketingOn ? "accepted" : "rejected")}
            >
              Save my choices
            </button>
          ) : (
            <button
              type="button"
              className="cookie-wall-details-toggle"
              aria-expanded={false}
              onClick={() => setShowDetails(true)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.8c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
              </svg>
              Show details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
