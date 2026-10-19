import Link from "next/link";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";

const photoRoot = "/images/dublin-premium";

function DublinPhoto({ asset, alt, priority = false }: { asset: string; alt: string; priority?: boolean }) {
  const srcSet = (ext: string) => [640, 960, 1600].map((w) => `${photoRoot}/${asset}-${w}.${ext} ${w}w`).join(", ");
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={priority ? "(min-width: 1280px) 1152px, 100vw" : "(min-width: 768px) 560px, 100vw"} />
      <source type="image/webp" srcSet={srcSet("webp")} sizes={priority ? "(min-width: 1280px) 1152px, 100vw" : "(min-width: 768px) 560px, 100vw"} />
      {/* Local responsive images use picture because this site is statically exported. */}
      <img src={`${photoRoot}/${asset}-960.jpg`} srcSet={srcSet("jpg")} sizes={priority ? "(min-width: 1280px) 1152px, 100vw" : "(min-width: 768px) 560px, 100vw"}
        width={1600} height={priority ? 533 : 1067} alt={alt} loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"} decoding="async"
        className={priority ? "h-full w-full object-cover object-[35%_center]" : "h-full w-full object-cover"} />
    </picture>
  );
}

export function DublinPremiumHero({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-4 pt-6 sm:px-6 lg:px-8" data-dublin-premium>
      <Link href="/airports/" className="inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4">All airports</Link>
      <div className="overflow-hidden rounded-3xl bg-[#f6f5ef] text-navy">
        <figure>
          <div className="aspect-[4/3] overflow-hidden sm:aspect-[3/1]">
            <div className="relative h-full" role="img" aria-label="Illustrative dark estate car over a genuine photograph of Dublin Airport Terminal 2">
              <DublinPhoto asset="hero" alt="Dublin Airport Terminal 2 photographed by Ronan Menton" priority />
              {/* Keep the terminal photograph untouched: AI is a separate transparent foreground. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${photoRoot}/car-960.webp`} srcSet={`${photoRoot}/car-480.webp 480w, ${photoRoot}/car-960.webp 960w`} sizes="(min-width: 1280px) 560px, (min-width: 640px) 50vw, 85vw" width={960} height={460} alt="" aria-hidden="true" fetchPriority="high" decoding="async" className="absolute bottom-[3%] left-[5%] w-[85%] sm:w-[50%]" />
            </div>
          </div>
          <figcaption className="px-5 py-3 text-xs leading-relaxed text-slate-600 sm:px-10">
            Terminal 2 photo: <a href="https://commons.wikimedia.org/wiki/File:Outside_Terminal_2.JPG" className="underline">Ronan Menton</a>,{" "}
            <a href="https://creativecommons.org/licenses/by/3.0/" className="underline">CC BY 3.0</a>. Illustrative vehicle added with AI; vehicle and collection point vary by booking.
          </figcaption>
        </figure>
        <header className="grid gap-7 px-5 pb-8 pt-4 sm:px-10 sm:pb-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-800">DUB · Private airport transfers</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
            <div className="mt-6"><LandingPageQuoteCta /></div>
            <p className="mt-3 text-xs text-slate-600">Quote first. Add your pickup date and time when you book.</p>
          </div>
          <div className="lg:pt-7">
            <p className="text-base leading-relaxed text-slate-700 sm:text-lg">A private journey between Dublin Airport, Belfast and our Northern Ireland service area. Get a fixed price for your addresses, choose an available vehicle and book securely online.</p>
            <ul className="mt-6 divide-y divide-slate-300 border-y border-slate-300 text-sm">
              <li className="py-3">Applicable tolls included in your quote</li>
              <li className="py-3">Terminal 1 &amp; Terminal 2 collection guidance</li>
              <li className="py-3">Secure SumUp Hosted Checkout</li>
            </ul>
          </div>
        </header>
      </div>
      <nav aria-label="Choose your Dublin Airport transfer direction" className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href="/transfers/belfast-to-dublin-airport/" className="group rounded-2xl border border-white/20 p-5 text-white transition-colors hover:border-emerald focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald">Flying out</span>
          <span className="mt-2 block text-xl font-bold">Belfast → Dublin Airport <span aria-hidden="true">↗</span></span>
          <span className="mt-2 block text-sm text-white/75">Your home or hotel to your departure terminal.</span>
        </Link>
        <Link href="/transfers/dublin-airport-to-belfast/" className="group rounded-2xl border border-white/20 p-5 text-white transition-colors hover:border-emerald focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald">Landing in Dublin</span>
          <span className="mt-2 block text-xl font-bold">Dublin Airport → Belfast <span aria-hidden="true">↗</span></span>
          <span className="mt-2 block text-sm text-white/75">A pre-booked collection for the journey north.</span>
        </Link>
      </nav>
    </section>
  );
}

export function DublinTravelExperience() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8" aria-labelledby="dublin-experience-heading">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald">Before you travel</p>
      <h2 id="dublin-experience-heading" className="mt-3 text-2xl font-bold text-white sm:text-3xl">Your pickup. Your luggage. Your journey.</h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <article className="overflow-hidden rounded-2xl bg-[#f6f5ef] text-navy">
          <figure>
            <div className="relative aspect-[3/2] overflow-hidden" role="img" aria-label="Illustrative driver and travellers with luggage over a genuine Terminal 1 photograph">
              <DublinPhoto asset="pickup" alt="Dublin Airport Terminal 1 photographed by M901QX" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${photoRoot}/assistance-960.webp`} srcSet={`${photoRoot}/assistance-480.webp 480w, ${photoRoot}/assistance-960.webp 960w`} sizes="(min-width: 1280px) 530px, (min-width: 768px) 48vw, 95vw" width={960} height={766} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-x-0 bottom-0 mx-auto max-h-[80%] w-[95%] object-contain object-bottom" />
            </div>
            <figcaption className="px-6 pt-4 text-xs leading-relaxed text-slate-600">Terminal 1 photo: <a href="https://commons.wikimedia.org/wiki/File:Exterior_Dublin_Airport_T1.jpg" className="underline">M901QX</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline">CC BY-SA 4.0</a>. Cropped/resized photograph with a separate AI foreground. Adaptation shared under the same licence.</figcaption>
          </figure>
          <div className="p-6">
            <h3 className="text-xl font-bold">A collection planned around your arrival</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">Add your flight number when booking. Follow your driver’s confirmed meeting instructions after collecting your bags. For help with luggage or a particular assistance requirement, contact us before booking.</p>
            <p className="mt-3 text-xs text-slate-600">Illustrative scene; not a photograph of our staff or a designated meeting point.</p>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl bg-[#f6f5ef] text-navy">
          <figure>
            <div className="aspect-[3/2] overflow-hidden"><DublinPhoto asset="interior" alt="Illustrative black leather rear passenger seating in an executive-style car" /></div>
            <figcaption className="px-6 pt-4 text-xs leading-relaxed text-slate-600">AI-generated representative interior. Vehicle, upholstery and space vary; a specific model or leather interior is not guaranteed.</figcaption>
          </figure>
          <div className="p-6">
            <h3 className="text-xl font-bold">Choose the right space for your trip</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">Enter everyone travelling and all suitcases to see suitable vehicle options. Review the passenger and luggage allowance with your quote. Ask us about oversized luggage before booking.</p>
            <div className="mt-5"><LandingPageQuoteCta label="Check your journey quote" /></div>
          </div>
        </article>
      </div>
    </section>
  );
}

/** Genuine, credited terminal photo for the two existing Belfast directional pages. */
export function DublinRouteHeroMedia() {
  return (
    <figure className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="aspect-[2/1] overflow-hidden rounded-2xl sm:aspect-[3/1]"><DublinPhoto asset="hero" alt="Dublin Airport Terminal 2 photographed by Ronan Menton" priority /></div>
      <figcaption className="py-3 text-xs text-white/75">Dublin Airport Terminal 2: <a href="https://commons.wikimedia.org/wiki/File:Outside_Terminal_2.JPG" className="underline">Ronan Menton</a>, <a href="https://creativecommons.org/licenses/by/3.0/" className="underline">CC BY 3.0</a>. Cropped and resized; not a meeting-point photograph.</figcaption>
    </figure>
  );
}
