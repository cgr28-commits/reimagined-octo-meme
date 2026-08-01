"use client";

import { useState } from "react";
import Logo from "./Logo";
import { MOBILE_QUICK_LINKS, NAV_LINKS, SITE } from "@/lib/data";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-navy/80 backdrop-blur-xl">
      <div className="hidden border-b border-white/10 bg-navy-dark/90 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-end px-4 py-2 sm:px-6 lg:px-8">
          <a
            href={`mailto:${SITE.email}`}
            className="text-sm font-medium text-white/70 transition-colors hover:text-emerald"
          >
            {SITE.email}
          </a>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <a href="#" aria-label={`${SITE.name} home`} className="shrink-0">
          <Logo className="h-16 sm:h-20" />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/70 transition-colors hover:text-emerald"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <a
            href="#quote"
            className="rounded-full bg-emerald px-5 py-2 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
          >
            Get a Quote
          </a>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu — all services"}
        >
          <span className="text-xs font-semibold text-white/90">{menuOpen ? "Close" : "Menu"}</span>
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <nav
        className="overflow-x-clip border-t border-white/10 bg-navy-light/95 px-4 py-2.5 backdrop-blur-xl md:hidden"
        aria-label="Quick services"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
          Transfers · Day trips · Chauffeur
        </p>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MOBILE_QUICK_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                "highlight" in link && link.highlight
                  ? "bg-emerald text-navy"
                  : "border border-white/20 bg-white/5 text-white/85 hover:border-emerald/40 hover:text-emerald"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <nav
          className="border-t border-white/10 bg-navy-light/95 px-4 py-4 backdrop-blur-xl md:hidden"
          aria-label="Mobile navigation"
        >
          <p className="mb-3 text-sm text-white/60">
            Airport transfers, private day trips, chauffeur hire, and more.
          </p>
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-emerald"
              >
                {link.label}
              </a>
            ))}
            <hr className="my-2 border-white/10" />
            <a
              href="#quote"
              onClick={closeMenu}
              className="rounded-full bg-emerald px-5 py-3 text-center text-sm font-semibold text-navy"
            >
              Get a Quote
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
