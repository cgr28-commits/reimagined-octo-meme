import Link from "next/link";
import Logo from "./Logo";
import { NAV_LINKS, SITE } from "@/lib/data";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-navy-dark">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo className="h-16" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              Northern Ireland&apos;s trusted airport transfer service. Professional
              drivers, prices from £35, and 24/7 availability.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-white/50 transition-colors hover:text-emerald"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Contact
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-white/50">
              <li>
                <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-emerald">
                  {SITE.email}
                </a>
              </li>
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
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Service Hours
            </h3>
            <p className="mt-4 text-sm text-white/50">
              Open 24 hours a day,
              <br />
              7 days a week,
              <br />
              365 days a year.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/40">
            &copy; {year} {SITE.name}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/40">
            <Link href="/terms" className="transition-colors hover:text-emerald">
              Terms &amp; Conditions
            </Link>
            <span className="hidden text-white/20 sm:inline">|</span>
            <span className="text-white/30">Fully licensed &amp; insured private hire operator</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
