"use client";

/**
 * Desktop floating WhatsApp button (bottom-right).
 * Opens a small panel with a QR code to scan with a phone, the assistant's number
 * and an "Open WhatsApp" link. Both pre-fill the journey being quoted, if any.
 * Mobile keeps the Header quick-row WhatsApp icon instead (no floating button there).
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import QRCode from "qrcode";
import { SITE } from "@/lib/data";
import { useIsMobileDevice } from "@/lib/device";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";
import { useWhatsAppAssistantHref, useWhatsAppJourney } from "@/lib/whatsapp-journey-context";

type Props = { style: CSSProperties; corner: "bottom-left" | "bottom-right" };

function WhatsAppQrLauncher({ style, corner }: Props) {
  const [open, setOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const href = useWhatsAppAssistantHref();
  const journey = useWhatsAppJourney();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toString(href, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#071c38", light: "#ffffff" } })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, href]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const sideStyle: CSSProperties =
    corner === "bottom-left" ? { left: style.left, right: "auto" } : { right: style.right, left: "auto" };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-matni-whatsapp-qr-launcher="true"
        onClick={() => setOpen((v) => !v)}
        style={style}
        className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/35 transition-transform hover:scale-105"
        aria-label={open ? "Close WhatsApp" : "Chat on WhatsApp"}
        aria-expanded={open}
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          data-matni-whatsapp-qr-panel="true"
          style={{ position: "fixed", zIndex: 61, bottom: `calc(${String(style.bottom)} + 62px)`, ...sideStyle }}
          className="w-[18rem] rounded-2xl border border-white/15 bg-navy-dark p-4 text-center text-white shadow-2xl"
        >
          <p id={titleId} className="text-base font-semibold">
            Chat with us on WhatsApp
          </p>
          <p className="mt-1 text-xs text-white/65">
            Scan with your phone camera to open WhatsApp
            {journey ? " — your journey details are filled in for you." : "."}
          </p>
          <div
            className="mx-auto mt-3 h-44 w-44 overflow-hidden rounded-lg bg-white p-1"
            data-matni-whatsapp-qr="true"
            aria-label="WhatsApp QR code"
            role="img"
            // qrcode returns a self-contained SVG string built from our own link.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-3 text-sm font-semibold">{SITE.name}</p>
          <p className="text-xs text-white/65">WhatsApp {SITE.whatsappAssistantDisplay} · instant quotes 24/7</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-navy"
          >
            Open WhatsApp on this computer
          </a>
        </div>
      ) : null}
    </>
  );
}

// Sit above the cookie banner while it is showing (CookieConsent sets this variable).
const EDGE = "calc(max(22px, env(safe-area-inset-bottom, 0px)) + var(--matni-cookie-banner-offset, 0px))";
const EDGE_RIGHT = "max(22px, env(safe-area-inset-right, 0px))";

/** Desktop/tablet only (≥768px); mobile uses the Header quick-row WhatsApp icon. */
export default function WhatsAppQrFloating() {
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobileDevice();
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);

  if (!mounted || isMobile !== false || !SITE.whatsappAssistantLive) return null;
  if (shouldHidePublicSalesWidgets(pathname)) return null;
  return createPortal(
    <WhatsAppQrLauncher
      corner="bottom-right"
      style={{ position: "fixed", zIndex: 60, bottom: EDGE, right: EDGE_RIGHT, left: "auto", top: "auto" }}
    />,
    document.body,
  );
}
