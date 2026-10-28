import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/data";
import {
  FREE_PICKUP_POINTS,
  getFreePickupPoint,
  googleMapsEmbedUrl,
  googleMapsUrl,
} from "../../../../shared/pickup-points";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FREE_PICKUP_POINTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const point = getFreePickupPoint(slug);
  return {
    title: point ? `${point.airportName} — ${point.title} | ${SITE.name}` : `Pick-up point | ${SITE.name}`,
    description: point ? `Where to meet your ${SITE.name} driver at ${point.airportName}.` : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function PickupPointPage({ params }: Props) {
  const { slug } = await params;
  const point = getFreePickupPoint(slug);
  if (!point) notFound();

  return (
    <main className="min-h-screen bg-navy px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/" aria-label={`${SITE.name} home`} className="inline-block">
          <Logo className="h-12" />
        </Link>

        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-emerald">{point.airportName}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{point.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-white/80">{point.directions}</p>
        <p className="mt-2 text-sm text-white/60">{point.walkNote}</p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <iframe
            title={`Map of the ${point.title.toLowerCase()} at ${point.airportName}`}
            src={googleMapsEmbedUrl(point)}
            className="block h-80 w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <a
          href={googleMapsUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-emerald px-5 text-base font-semibold text-navy"
        >
          Open in Google Maps
        </a>

        <a
          href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi, I'm at the pick-up point.")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-12 items-center justify-center rounded-full border border-white/20 px-5 text-base font-semibold text-white"
        >
          I&apos;m here — message us on WhatsApp
        </a>
      </div>
    </main>
  );
}
