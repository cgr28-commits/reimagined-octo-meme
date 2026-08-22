"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Logo from "./Logo";
import QuoteNavLink from "./QuoteNavLink";
import SiteNavLink from "./SiteNavLink";
import { MOBILE_QUICK_LINKS, NAV_LINKS, SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;

    // Lock the page behind the overlay (iOS Safari-friendly).
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  const mobileMenu =
    mounted && menuOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex h-[100dvh] max-h-[100dvh] flex-col xl:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
          >
            <button
              type="button"
              className="absolute inset-0 bg-navy-dark/70 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={closeMenu}
            />
            <div
              id={menuId}
              className="relative z-10 flex h-full min-h-0 w-full flex-col border-b border-white/10 bg-navy pt-[env(safe-area-inset-top)] shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
                <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0" onClick={closeMenu}>
                  <Logo className="h-14" />
                </Link>
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  <span className="text-xs font-semibold text-white/90">Close</span>
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 touch-pan-y"
                aria-label="Mobile navigation"
              >
                <p className="mb-3 text-sm text-white/60">Airport transfers across Northern Ireland.</p>
                <div className="flex flex-col gap-1">
                  {NAV_LINKS.map((link) => (
                    <SiteNavLink
                      key={link.href}
                      href={link.href}
                      onNavigate={closeMenu}
                      className="min-h-11 rounded-lg px-3 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/5 hover:text-emerald"
                    >
                      {link.label}
                    </SiteNavLink>
                  ))}
                  <hr className="my-3 border-white/10" />
                  <SiteNavLink
                    href="/manage-booking/"
                    onNavigate={closeMenu}
                    className="flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 py-3.5 text-center text-sm font-semibold text-white/90"
                  >
                    Manage Your Booking
                  </SiteNavLink>
                  <QuoteNavLink
                    onNavigate={closeMenu}
                    className="flex min-h-11 items-center justify-center rounded-full bg-emerald px-5 py-3.5 text-center text-sm font-semibold text-navy"
                  >
                    Get a Quote
                  </QuoteNavLink>
                  <a
                    href={`tel:${SITE.landline}`}
                    onClick={closeMenu}
                    className="mt-2 flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white/90"
                  >
                    Call {SITE.landlineDisplay}
                  </a>
                  <a
                    href={whatsAppChatUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white/90"
                  >
                    WhatsApp @{SITE.whatsappUsername}
                  </a>
                  <SiteNavLink
                    href="/contact/"
                    onNavigate={closeMenu}
                    className="flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white/90"
                  >
                    Contact
                  </SiteNavLink>
                </div>
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] max-w-[100%] transition-[background-color,backdrop-filter,border-color] duration-200 ${
          scrolled
            ? "border-b border-white/10 bg-navy/95 backdrop-blur-md"
            : "border-b border-white/5 bg-navy/90 backdrop-blur-sm"
        }`}
      >
        <div className="hidden xl:block">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2 text-xs font-medium text-white/55 sm:justify-between sm:px-6 sm:text-sm lg:max-w-[1400px] lg:px-10 xl:px-12">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="text-emerald/90">Licensed &amp; insured</span>
              <span className="text-white/20" aria-hidden>
                ·
              </span>
              <span className="text-emerald/90">Flight tracking</span>
              <span className="text-white/20" aria-hidden>
                ·
              </span>
              <span className="text-emerald/90">Secure SumUp payment</span>
            </p>
            <p className="hidden text-white/40 lg:block">24/7 airport transfers across Northern Ireland</p>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 md:py-3 xl:grid xl:max-w-[1400px] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center xl:gap-x-6 xl:px-10 2xl:gap-x-8 2xl:px-12">
          <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0">
            <Logo className="h-14 sm:h-16 md:h-20" />
          </Link>

          <nav
            className="hidden items-center gap-6 xl:flex xl:justify-center xl:gap-5 2xl:gap-7"
            aria-label="Main navigation"
          >
            {NAV_LINKS.map((link) => (
              <SiteNavLink
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-sm font-medium text-white/70 transition-colors hover:text-emerald"
              >
                {link.label}
              </SiteNavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 xl:flex xl:justify-self-end">
            <SiteNavLink
              href="/manage-booking/"
              className="whitespace-nowrap rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition-colors hover:border-emerald/50 hover:text-emerald lg:px-5"
            >
              Manage Your Booking
            </SiteNavLink>
            <QuoteNavLink className="rounded-full bg-emerald px-5 py-2 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 lg:px-6">
              Get a Quote
            </QuoteNavLink>
          </div>

          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 xl:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu — all services"}
          >
            <span className="text-xs font-semibold text-white/90">{menuOpen ? "Close" : "Menu"}</span>
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <nav
          className="max-w-full overflow-x-clip px-4 pb-2 pt-1 xl:hidden"
          aria-label="Quick services"
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Airport transfers · Get a quote
          </p>
          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            {MOBILE_QUICK_LINKS.map((link) => {
              const className = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                "highlight" in link && link.highlight
                  ? "bg-emerald text-navy"
                  : "border border-white/15 bg-white/[0.04] text-white/80 hover:border-emerald/40 hover:text-emerald"
              }`;
              const isQuoteCta = link.label === "Get a Quote";

              if (isQuoteCta) {
                return (
                  <QuoteNavLink
                    key={link.href}
                    href={link.href}
                    onNavigate={closeMenu}
                    className={className}
                  >
                    {link.label}
                  </QuoteNavLink>
                );
              }

              return (
                <SiteNavLink
                  key={link.href}
                  href={link.href}
                  onNavigate={closeMenu}
                  className={className}
                >
                  {link.label}
                </SiteNavLink>
              );
            })}
            <a
              href={whatsAppChatUrl(
                "Hi, I need some help with an airport transfer.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              data-matni-whatsapp-quick="true"
              aria-label="WhatsApp us for help with an airport transfer"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-transform hover:scale-[1.03] active:scale-95"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
          </div>
        </nav>
      </header>

      {mobileMenu}
    </>
  );
}
