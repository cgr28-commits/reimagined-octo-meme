import Link from "next/link";
import SectionHeading from "./SectionHeading";
import { DRIVER_TRACKING_HIGHLIGHTS, SERVICE_FLAGS } from "@/lib/data";

export default function DriverTrackingSection() {
  return (
    <section id="driver-tracking" className="relative scroll-mt-36 md:scroll-mt-28 py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-dark/40 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="On travel day"
          title="Live driver tracking"
          navId="driver-tracking"
          description="When you pay online, we send a tracking link with your invoice. On the day of your transfer, follow your driver's live location when they're on the way to you."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {DRIVER_TRACKING_HIGHLIGHTS.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/20 hover:bg-white/[0.05]"
              >
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-emerald/20 bg-emerald/5 p-8 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              How it works
            </p>
            <ol className="mt-6 space-y-4 text-sm leading-relaxed text-white/75">
              <li>
                <span className="font-semibold text-white">1. Book &amp; pay online</span>
                <br />
                Your confirmation email includes a personal tracking link.
              </li>
              <li>
                <span className="font-semibold text-white">2. Save the link</span>
                <br />
                Tracking opens on travel day, about one hour before your pickup time.
              </li>
              <li>
                <span className="font-semibold text-white">3. Follow your driver</span>
                <br />
                When your driver is en route, you&apos;ll see their live location on a map.
              </li>
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-white/50">
              Tracking is included at no extra cost for card payments made through our website.
              Your driver may also send the link via WhatsApp on the day.
            </p>
            {/* Soft-hidden via SERVICE_FLAGS.trackingDemo — set true in data.ts to restore */}
            {SERVICE_FLAGS.trackingDemo ? (
              <Link
                href="/track/demo/"
                className="mt-8 inline-flex w-fit rounded-full bg-emerald px-6 py-3 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
              >
                See a demo
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
