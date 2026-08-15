"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Logo from "./Logo";
import { MOBILE_QUICK_LINKS, NAV_LINKS, PRIMARY_NAV_LINKS, SITE } from "@/lib/data";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  const mobileMenu =
    mounted && menuOpen
      ? createPortal(
          <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
            <button
              type="button"
              className="absolute inset-0 bg-navy-dark/70 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={closeMenu}
            />
            <div
              id={menuId}
              className="absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col overflow-y-auto overscroll-contain border-b border-white/10 bg-navy shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0" onClick={closeMenu}>
                  <Logo className="h-14" />
                </Link>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  <span className="text-xs font-semibold text-white/90">Close</span>
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="px-4 pb-6 pt-2" aria-label="Mobile navigation">
                <p className="mb-3 text-sm text-white/60">Airport transfers across Northern Ireland.</p>
                <div className="flex flex-col gap-1">
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={closeMenu}
                      className="rounded-lg px-3 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/5 hover:text-emerald"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <hr className="my-3 border-white/10" />
                  <Link
                    href="/#quote"
                    onClick={closeMenu}
                    className="rounded-full bg-emerald px-5 py-3.5 text-center text-sm font-semibold text-navy"
                  >
                    Get a Quote
                  </Link>
                  <a
                    href={`tel:${SITE.landline}`}
                    onClick={closeMenu}
                    className="mt-2 rounded-full border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white/90"
                  >
                    Call {SITE.landlineDisplay}
                  </a>
                </div>
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] max-w-[100%] border-b border-white/8 bg-navy/95 backdrop-blur-md">
        <div className="hidden md:block">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 border-b border-white/6 px-4 py-2 text-xs font-medium text-white/45 sm:justify-between sm:px-6 sm:text-sm lg:px-8">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>Licensed &amp; insured</span>
              <span className="text-white/15" aria-hidden>
                ·
              </span>
              <span>Flight tracking</span>
              <span className="text-white/15" aria-hidden>
                ·
              </span>
              <span>Secure SumUp payment</span>
            </p>
            <p className="hidden text-white/35 lg:block">24/7 airport transfers across Northern Ireland</p>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0">
            <Logo className="h-14 sm:h-16" />
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            {PRIMARY_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/65 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/#quote"
              className="rounded-full bg-emerald px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-emerald-light"
            >
              Get a Quote
            </Link>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 md:hidden"
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
          className="max-w-full overflow-x-clip px-4 py-2.5 md:hidden"
          aria-label="Quick services"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Airport transfers · Get a quote
          </p>
          <div className="flex max-w-full flex-wrap gap-2">
            {MOBILE_QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  "highlight" in link && link.highlight
                    ? "bg-emerald text-navy"
                    : "border border-white/15 bg-white/[0.04] text-white/80 hover:border-emerald/40 hover:text-emerald"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {mobileMenu}
    </>
  );
}
