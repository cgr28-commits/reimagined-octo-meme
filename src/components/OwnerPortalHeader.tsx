"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/data";

type OwnerPortalHeaderProps = {
  /** Short label shown next to the brand. */
  title?: string;
  variant?: "owner" | "driver" | "admin";
};

/**
 * Simplified fixed header for private ops routes (/owner/*, /admin/*, /driver).
 * Does not render public Airports / Get a Quote marketing navigation.
 */
export default function OwnerPortalHeader({
  title,
  variant = "owner",
}: OwnerPortalHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuId = useId();
  const resolvedTitle =
    title ??
    (variant === "driver" ? "Driver" : variant === "admin" ? "Owner tools" : "Owner Dashboard");
  const homeHref = variant === "driver" ? "/driver/" : "/owner/";

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
          <div
            className="fixed inset-0 z-[80] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={`${resolvedTitle} menu`}
          >
            <button
              type="button"
              className="absolute inset-0 bg-navy-dark/70 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={closeMenu}
            />
            <div
              id={menuId}
              className="absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col overflow-y-auto overscroll-contain border-b border-white/10 bg-navy pt-[env(safe-area-inset-top)] shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={homeHref} aria-label={`${SITE.name} ${resolvedTitle}`} onClick={closeMenu}>
                  <Logo className="h-12" />
                </Link>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  <span className="text-xs font-semibold text-white/90">Close</span>
                </button>
              </div>
              <nav className="px-4 pb-8 pt-2" aria-label="Portal navigation">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald">
                  {resolvedTitle}
                </p>
                <div className="flex flex-col gap-1">
                  {variant === "driver" ? (
                    <Link
                      href="/driver/"
                      onClick={closeMenu}
                      className="rounded-xl px-3 py-3 text-base font-semibold text-white hover:bg-white/5"
                    >
                      Driver bookings
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/owner/"
                        onClick={closeMenu}
                        className="rounded-xl px-3 py-3 text-base font-semibold text-white hover:bg-white/5"
                      >
                        Bookings & tracking
                      </Link>
                      <Link
                        href="/admin/refund/"
                        onClick={closeMenu}
                        className="rounded-xl px-3 py-3 text-base font-semibold text-white hover:bg-white/5"
                      >
                        Issue refund
                      </Link>
                      <Link
                        href="/admin/ad-fraud/"
                        onClick={closeMenu}
                        className="rounded-xl px-3 py-3 text-base font-semibold text-white hover:bg-white/5"
                      >
                        Ad Fraud
                      </Link>
                    </>
                  )}
                  <Link
                    href="/"
                    onClick={closeMenu}
                    className="rounded-xl px-3 py-3 text-sm font-medium text-white/55 hover:bg-white/5"
                  >
                    Public website
                  </Link>
                </div>
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] border-b border-white/10 bg-navy/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={homeHref} aria-label={`${SITE.name} ${resolvedTitle}`} className="shrink-0">
              <Logo className="h-11 sm:h-12" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white sm:text-base">{resolvedTitle}</p>
              <p className="hidden truncate text-xs text-white/50 sm:block">{SITE.name}</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Portal desktop navigation">
            {variant === "driver" ? (
              <Link
                href="/driver/"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/owner/"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/refund/"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Refunds
                </Link>
                <Link
                  href="/admin/ad-fraud/"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Ad Fraud
                </Link>
              </>
            )}
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-medium text-white/45 transition-colors hover:bg-white/5 hover:text-white/70"
            >
              Public site
            </Link>
          </nav>

          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/15 bg-white/5 md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </header>
      {mobileMenu}
    </>
  );
}
