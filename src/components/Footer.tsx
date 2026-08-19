import Link from "next/link";
import Logo from "./Logo";
import FooterContact from "./FooterContact";
import { NAV_LINKS, SERVICE_FLAGS, SITE } from "@/lib/data";
import { AIRPORT_PAGES } from "@/lib/location-pages";
import { TOURS } from "@/lib/tours";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-navy-dark">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:max-w-[1400px] lg:px-10 lg:py-16 xl:px-12">
        <div
          className={`grid gap-10 sm:grid-cols-2 ${
            SERVICE_FLAGS.dayTrips ? "lg:grid-cols-6" : "lg:grid-cols-5"
          }`}
        >
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo className="h-16" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              Professional airport transfers across Northern Ireland and beyond. Clear fixed
              prices and 24/7 availability.
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
              <li>
                <Link
                  href="/manage-booking/"
                  className="text-sm text-white/50 transition-colors hover:text-emerald"
                >
                  Manage Booking
                </Link>
              </li>
              <li>
                <Link
                  href="/airports/"
                  className="text-sm text-white/50 transition-colors hover:text-emerald"
                >
                  Airport guides
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Airports
            </h3>
            <ul className="mt-4 space-y-2">
              {AIRPORT_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/airports/${page.slug}/`}
                    className="text-sm text-white/50 transition-colors hover:text-emerald"
                  >
                    {page.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {SERVICE_FLAGS.dayTrips ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                Day Trips
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link href="/tours/" className="text-sm text-white/50 transition-colors hover:text-emerald">
                    All day trips
                  </Link>
                </li>
                {TOURS.map((tour) => (
                  <li key={tour.slug}>
                    <Link
                      href={`/tours/${tour.slug}/`}
                      className="text-sm text-white/50 transition-colors hover:text-emerald"
                    >
                      {tour.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Contact
            </h3>
            <FooterContact />
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
            <Link
              href="/contact/"
              className="rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1.5 text-xs font-semibold text-emerald transition-colors hover:bg-emerald/20"
            >
              Save to contacts
            </Link>
            <span className="text-white/20">|</span>
            <Link href="/terms/" className="transition-colors hover:text-emerald">
              Terms &amp; Conditions
            </Link>
            <span className="text-white/20">|</span>
            <Link href="/privacy/" className="transition-colors hover:text-emerald">
              Privacy Policy
            </Link>
            <span className="hidden text-white/20 sm:inline">|</span>
            <span className="text-white/30">Fully licensed &amp; insured private hire operator</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
