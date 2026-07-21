"use client";

import { useState } from "react";
import Logo from "./Logo";
import { NAV_LINKS, SITE } from "@/lib/data";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

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

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a href="#" aria-label={`${SITE.name} home`}>
          <Logo className="h-20" />
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
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <nav
          className="border-t border-white/10 bg-navy-light/95 px-4 py-4 backdrop-blur-xl md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-emerald"
              >
                {link.label}
              </a>
            ))}
            <hr className="border-white/10" />
            <a
              href="#quote"
              onClick={() => setMenuOpen(false)}
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
