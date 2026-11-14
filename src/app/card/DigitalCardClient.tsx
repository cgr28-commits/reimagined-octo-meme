"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import {
  DIGITAL_CARD_QR_PNG,
  DIGITAL_CARD_QR_SVG,
  DIGITAL_CARD_URL,
  DIGITAL_CARD_VCARD_FILENAME,
  detectDeviceKind,
  digitalCardVCardHref,
  isStandaloneDisplay,
  trackDigitalCardEvent,
  whatsAppShareUrl,
  type DeviceKind,
} from "@/lib/digital-card";
import { withBasePath } from "@/lib/paths";

/* ---------- icons (inline, currentColor) ---------- */

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const PhoneIcon = () => (
  <Icon>
    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
  </Icon>
);

const WhatsAppIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 012.89 7c0 5.45-4.43 9.88-9.85 9.88m8.41-18.3A11.82 11.82 0 0012.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9a11.82 11.82 0 00-3.48-8.4z" />
  </svg>
);

const ContactIcon = () => (
  <Icon>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </Icon>
);

const ShareIcon = () => (
  <Icon>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
  </Icon>
);

const QrIcon = () => (
  <Icon className="h-4 w-4">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
  </Icon>
);

const HomeIcon = () => (
  <Icon className="h-4 w-4">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M12 8v6M9 11h6" />
  </Icon>
);

const PlaneIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

const CheckIcon = () => (
  <Icon className="h-3.5 w-3.5">
    <path d="M20 6L9 17l-5-5" />
  </Icon>
);

/* ---------- bottom sheet / dialog ---------- */

function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-[#020a16]/75 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dc-sheet relative w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#0a2346] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <Icon>
              <path d="M18 6L6 18M6 6l12 12" />
            </Icon>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- QR panel (sheet on phones, side panel on desktop) ---------- */

function QrPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-center">
      <div className={`mx-auto inline-flex rounded-3xl bg-white ${compact ? "p-3" : "p-4"} shadow-[0_20px_60px_rgba(0,0,0,0.35)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={withBasePath(DIGITAL_CARD_QR_PNG)}
          alt={`QR code that opens ${DIGITAL_CARD_URL}`}
          width={240}
          height={240}
          className={compact ? "h-52 w-52" : "h-60 w-60"}
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">myairporttaxini.co.uk/card</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={withBasePath(DIGITAL_CARD_QR_PNG)}
          download="my-airport-taxi-ni-card-qr.png"
          className="flex min-h-11 items-center justify-center rounded-xl bg-emerald px-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
        >
          Download PNG
        </a>
        <a
          href={withBasePath(DIGITAL_CARD_QR_SVG)}
          download="my-airport-taxi-ni-card-qr.svg"
          className="flex min-h-11 items-center justify-center rounded-xl border border-white/25 px-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
        >
          SVG for print
        </a>
      </div>
    </div>
  );
}

/* ---------- Add to Home Screen guidance ---------- */

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald text-sm font-extrabold text-navy">{n}</span>
      <span className="pt-0.5 text-[15px] leading-snug text-white/90">{children}</span>
    </li>
  );
}

function HomeScreenGuide({ device }: { device: DeviceKind }) {
  const iphone = (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-emerald">iPhone (Safari)</p>
      <ol className="mt-3 space-y-3">
        <Step n={1}>
          Tap the <strong>Share</strong> button{" "}
          <span aria-hidden className="inline-block translate-y-[2px]">
            <Icon className="inline h-4 w-4">
              <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
            </Icon>
          </span>{" "}
          at the bottom of Safari.
        </Step>
        <Step n={2}>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>.
        </Step>
      </ol>
    </div>
  );
  const android = (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-emerald">Android (Chrome)</p>
      <ol className="mt-3 space-y-3">
        <Step n={1}>
          Tap the <strong>⋮</strong> menu at the top right of Chrome.
        </Step>
        <Step n={2}>
          Tap <strong>Add to Home screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong> (and <strong>Add</strong> again if asked).
        </Step>
      </ol>
    </div>
  );
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-white/75">
        Keep our card one tap away for your next journey. Your phone asks you to confirm, so it takes a few taps:
      </p>
      {device === "android" ? android : device === "iphone" ? iphone : (
        <>
          {iphone}
          {android}
        </>
      )}
      {device === "iphone" ? (
        <p className="text-xs leading-relaxed text-white/60">
          Using Chrome on iPhone? Tap the Share button next to the address bar, then Add to Home Screen.
        </p>
      ) : null}
    </div>
  );
}

/* ---------- main card ---------- */

const tileClass =
  "group flex min-h-[88px] min-w-0 flex-col items-start justify-between gap-2 rounded-2xl border border-white/12 bg-white/[0.05] p-3.5 text-left text-white transition-all hover:border-emerald/60 hover:bg-white/[0.09] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald";

const tileIconClass =
  "flex h-9 w-9 items-center justify-center rounded-xl bg-emerald/15 text-emerald transition-colors group-hover:bg-emerald group-hover:text-navy";

export default function DigitalCardClient() {
  const [device, setDevice] = useState<DeviceKind>("other");
  const [standalone, setStandalone] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDevice(detectDeviceKind());
    setStandalone(isStandaloneDisplay());
    trackDigitalCardEvent("digital_card_view");
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const closeQr = useCallback(() => setQrOpen(false), []);
  const closeHome = useCallback(() => setHomeOpen(false), []);

  async function shareCard() {
    const shareData: ShareData = {
      title: SITE.name,
      text: `${SITE.name} — Belfast & Dublin Airport Transfers. Instant quotes and secure online booking.`,
      url: DIGITAL_CARD_URL,
    };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        trackDigitalCardEvent("digital_card_share", { share_method: "native" });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return; // customer closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(DIGITAL_CARD_URL);
      trackDigitalCardEvent("digital_card_share", { share_method: "copy_link" });
      showToast("Card link copied — paste it anywhere to share");
    } catch {
      setQrOpen(true);
    }
  }

  const vcardHref = digitalCardVCardHref();

  return (
    <main data-digital-card className="relative min-h-dvh w-full max-w-full overflow-x-clip bg-navy text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_-5%,rgba(47,191,74,0.20),transparent_70%),radial-gradient(ellipse_90%_60%_at_50%_110%,rgba(12,42,82,0.95),transparent_70%)]"
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1040px] flex-col items-center justify-center gap-10 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:py-12">
        {/* ---- the card ---- */}
        <section
          aria-labelledby="dc-title"
          className="dc-rise w-full max-w-[440px] rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:p-6"
        >
          <div className="flex justify-center pt-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBasePath("/logo-wide.svg")}
              alt=""
              width={1011}
              height={177}
              className="h-auto w-full max-w-[300px]"
            />
          </div>

          <div className="mt-5 text-center">
            <h1 id="dc-title" className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
              {SITE.name}
            </h1>
            <p className="mt-1 text-[17px] font-semibold text-emerald">Belfast &amp; Dublin Airport Transfers</p>
          </div>

          <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Airports we serve">
            {["Belfast International", "Belfast City", "Dublin Airport"].map((airport) => (
              <li
                key={airport}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold text-white/90"
              >
                <span className="text-emerald">
                  <PlaneIcon />
                </span>
                {airport}
              </li>
            ))}
          </ul>

          {/* 1. Instant quote — the existing live quote flow on the homepage. A plain link (full page
              load) so the homepage starts with its own mobile design switch. */}
          <a
            href={withBasePath("/#quote")}
            onClick={() => trackDigitalCardEvent("digital_card_quote_click")}
            className="dc-shine relative mt-6 flex min-h-[58px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-emerald px-5 text-[17px] font-extrabold text-navy shadow-[0_14px_40px_rgba(47,191,74,0.35)] transition-transform hover:bg-emerald-light active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Get an Instant Quote
            <Icon>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </Icon>
          </a>

          {/* 2. Call */}
          <a
            href={`tel:${SITE.officeLandline}`}
            onClick={() => trackDigitalCardEvent("digital_card_call_click")}
            className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-[16px] font-bold text-navy transition-transform hover:bg-white/90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"
          >
            <PhoneIcon />
            <span>
              Call Us — <span className="whitespace-nowrap">{SITE.officeLandlineDisplay}</span>
            </span>
          </a>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {/* 3. WhatsApp chat (existing verified business WhatsApp) */}
            <a
              href={whatsAppChatUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackDigitalCardEvent("digital_card_whatsapp_click")}
              className={tileClass}
            >
              <span className={tileIconClass}>
                <WhatsAppIcon />
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">WhatsApp Us</span>
                <span className="block text-xs text-white/60">@{SITE.whatsappUsername}</span>
              </span>
            </a>

            {/* 4. Save to Contacts (vCard) */}
            <a
              href={vcardHref}
              {...(device === "other" ? { download: DIGITAL_CARD_VCARD_FILENAME } : {})}
              onClick={() => trackDigitalCardEvent("digital_card_contact_download", { device })}
              className={tileClass}
            >
              <span className={tileIconClass}>
                <ContactIcon />
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">Save to Contacts</span>
                <span className="block text-xs text-white/60">With our logo</span>
              </span>
            </a>

            {/* 5. Share via WhatsApp — prepares the message; the customer chooses who and taps Send */}
            <a
              href={whatsAppShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackDigitalCardEvent("digital_card_share", { share_method: "whatsapp" })}
              className={tileClass}
            >
              <span className={tileIconClass}>
                <WhatsAppIcon />
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">Share via WhatsApp</span>
                <span className="block text-xs text-white/60">Send to a friend</span>
              </span>
            </a>

            {/* 6. Share card (native share sheet, or copy link) */}
            <button type="button" onClick={shareCard} className={tileClass}>
              <span className={tileIconClass}>
                <ShareIcon />
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">Share Digital Card</span>
                <span className="block text-xs text-white/60">Text, email &amp; more</span>
              </span>
            </button>
          </div>

          <div className={`mt-3 grid gap-2.5 ${standalone ? "grid-cols-1" : "grid-cols-2"}`}>
            <button
              type="button"
              onClick={() => {
                setQrOpen(true);
                trackDigitalCardEvent("digital_card_qr_open");
              }}
              className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/12 px-3 text-[13px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:text-white sm:text-sm lg:hidden"
            >
              <QrIcon />
              Show QR code
            </button>
            {standalone ? null : (
              <button
                type="button"
                onClick={() => {
                  setHomeOpen(true);
                  trackDigitalCardEvent("digital_card_home_screen_help", { device });
                }}
                className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/12 px-3 text-[13px] font-semibold text-white/85 transition-colors hover:border-white/30 hover:text-white sm:text-sm lg:col-span-2"
              >
                <HomeIcon />
                Add to Home Screen
              </button>
            )}
          </div>

          <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-4 text-[13px] font-medium text-white/75">
            {["Fixed prices", "Flight monitoring", "Secure online booking"].map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <span className="text-emerald">
                  <CheckIcon />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-center">
            <a href={SITE.url} className="text-sm font-semibold text-emerald underline-offset-4 hover:underline">
              www.myairporttaxini.co.uk
            </a>
          </p>
        </section>

        {/* ---- desktop: scan to open on your phone ---- */}
        <aside className="dc-rise-late hidden w-full max-w-[340px] text-center lg:block" aria-label="QR code for this card">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald">Digital business card</p>
          <h2 className="mt-2 text-2xl font-extrabold">Scan to open on your phone</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Point your phone camera at the code to save us, get a quote or book your airport transfer.
          </p>
          <div className="mt-6">
            <QrPanel />
          </div>
        </aside>
      </div>

      <Sheet open={qrOpen} title="Scan to open this card" onClose={closeQr}>
        <QrPanel compact />
        <p className="mt-4 text-center text-xs leading-relaxed text-white/60">
          Show this code to anyone — their phone camera opens our card instantly.
        </p>
      </Sheet>

      <Sheet open={homeOpen} title="Add to your Home Screen" onClose={closeHome}>
        <HomeScreenGuide device={device} />
      </Sheet>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
        {toast ? (
          <p className="dc-toast rounded-full bg-white px-5 py-3 text-sm font-bold text-navy shadow-xl">{toast}</p>
        ) : null}
      </div>
    </main>
  );
}
