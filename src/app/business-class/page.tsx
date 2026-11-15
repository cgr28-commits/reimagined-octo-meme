import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "./business-class.css";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import BcPicture from "@/components/business-class/BcPicture";
import BcReveal from "@/components/business-class/BcReveal";
import ExecutiveQuoteForm from "@/components/business-class/ExecutiveQuoteForm";
import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import { BUSINESS_CLASS_PAGE_PUBLIC_ENABLED } from "@/lib/bespoke-public";
import {
  BC_ENQUIRY,
  BC_HERO,
  BC_HERO_PORTRAIT,
  BC_INTRO,
  BC_PAGE_FAQS,
  BC_PHOTOS,
  BC_SERVICES,
  BC_WHY,
  BUSINESS_CLASS_ENQUIRY_ANCHOR,
  BUSINESS_CLASS_PAGE_PATH,
  BUSINESS_CLASS_PAGE_SEO_DESCRIPTION,
  BUSINESS_CLASS_PAGE_SEO_TITLE,
  type BcService,
} from "@/lib/business-class-page-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const OG_IMAGE = "/images/business-class/business-class-airport-arrival-twilight-1280.jpg";

export function generateMetadata(): Metadata {
  if (!BUSINESS_CLASS_PAGE_PUBLIC_ENABLED) return { title: "Page not found", robots: { index: false, follow: false } };
  return {
    title: { absolute: BUSINESS_CLASS_PAGE_SEO_TITLE },
    description: BUSINESS_CLASS_PAGE_SEO_DESCRIPTION,
    alternates: { canonical: BUSINESS_CLASS_PAGE_PATH },
    openGraph: {
      type: "website",
      title: BUSINESS_CLASS_PAGE_SEO_TITLE,
      description: BUSINESS_CLASS_PAGE_SEO_DESCRIPTION,
      url: BUSINESS_CLASS_PAGE_PATH,
      siteName: SITE.name,
      locale: "en_GB",
      images: [{ url: OG_IMAGE, width: 1280, height: 720, alt: "Business Class & Executive Transfers — My Airport Taxi NI" }],
    },
    twitter: {
      card: "summary_large_image",
      title: BUSINESS_CLASS_PAGE_SEO_TITLE,
      description: BUSINESS_CLASS_PAGE_SEO_DESCRIPTION,
      images: [OG_IMAGE],
    },
  };
}

/* ---------- small presentational pieces ---------- */

function Eyebrow({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "navy" }) {
  return (
    <p className={`bc-eyebrow ${tone === "navy" ? "bc-eyebrow--navy" : ""}`}>
      <span className="bc-eyebrow__line" aria-hidden="true" />
      {children}
    </p>
  );
}

function WhyIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      {name === "handshake" ? (
        <g {...common}><path d="M4 13l5-4 5 2 4-2 5 1 5 4" /><path d="M9 9v9l5 5c1 1 2.5 1 3.4 0l5.6-5.6" /><path d="M14 11l-3 3c-.8.8-.8 2 0 2.8.8.8 2 .8 2.8 0L17 14" /></g>
      ) : name === "calendar" ? (
        <g {...common}><rect x="5" y="7" width="22" height="20" rx="2" /><path d="M5 13h22M11 4v5M21 4v5" /><path d="M12 20l3 3 6-6" /></g>
      ) : name === "attention" ? (
        <g {...common}><circle cx="16" cy="11" r="5" /><path d="M6 27c1.5-5 5.5-8 10-8s8.5 3 10 8" /></g>
      ) : name === "quote" ? (
        <g {...common}><path d="M9 4h10l6 6v18H9z" /><path d="M19 4v6h6M13 16h8M13 20h8M13 24h5" /></g>
      ) : name === "seat" ? (
        <g {...common}><path d="M10 5h8a2 2 0 0 1 2 2v11H11a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2z" /><path d="M8 18h17a2 2 0 0 1 2 2v2H11a3 3 0 0 1-3-3zM12 22v5M23 22v5" /></g>
      ) : (
        <g {...common}><path d="M16 4l10 4v7c0 6.5-4.3 11-10 13-5.7-2-10-6.5-10-13V8z" /><path d="M12 16l3 3 5-6" /></g>
      )}
    </svg>
  );
}

function ServicePoints({ service }: { service: BcService }) {
  return (
    <ul className="mt-8 border-t border-white/12">
      {service.points.map((p) => (
        <li key={p} className="flex items-center justify-between gap-4 border-b border-white/12 py-3.5 text-[1.0625rem] bc-c-w90">
          <span>{p}</span>
          <span className="bc-dot" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

function ServiceHeader({ service }: { service: BcService }) {
  return (
    <>
      <p className="flex items-baseline gap-4">
        <span className="font-display text-5xl font-medium bc-c-gold sm:text-6xl">{service.number}</span>
        <span className="text-[0.75rem] font-semibold uppercase tracking-[0.28em] bc-c-w60">{service.eyebrow}</span>
      </p>
      <h3 className="mt-5 font-display text-[2.25rem] font-medium leading-[1.05] bc-c-w sm:text-5xl">{service.title}</h3>
      <p className="mt-5 max-w-xl text-lg leading-relaxed bc-c-w75">{service.lead}</p>
    </>
  );
}

/* ---------- page ---------- */

export default function BusinessClassPage() {
  if (!BUSINESS_CLASS_PAGE_PUBLIC_ENABLED) notFound();

  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Business Class", path: BUSINESS_CLASS_PAGE_PATH },
  ]);
  const serviceLd = {
    ...getServiceAreaJsonLd({
      name: "Business Class & Executive Transfers",
      description: BUSINESS_CLASS_PAGE_SEO_DESCRIPTION,
      path: BUSINESS_CLASS_PAGE_PATH,
      areaServed: ["Belfast", "Northern Ireland", "Belfast City Airport", "Belfast International Airport", "Dublin Airport"],
      serviceType: "Executive transfer",
    }),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Business Class services",
      itemListElement: BC_SERVICES.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.title, description: s.lead },
      })),
    },
  };
  const faqLd = getFaqPageJsonLd(BC_PAGE_FAQS);
  const [airport, corporate, privateTravel] = BC_SERVICES;
  const hero = BC_PHOTOS.hero;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Header />
      <main className="bc-page overflow-x-clip bc-bg-midnight" data-business-class-page>
        {/* ---------------- Hero ---------------- */}
        <section className="bc-hero relative isolate flex min-h-[100svh] items-end overflow-hidden" aria-labelledby="bc-hero-title">
          <div className="bc-hero__media absolute inset-0 -z-10">
            <BcPicture
              photo={hero}
              priority
              sizes="100vw"
              portrait={BC_HERO_PORTRAIT}
              className="bc-hero__img h-full w-full object-cover object-[60%_60%]"
            />
          </div>
          <div className="bc-hero__shade absolute inset-0 -z-10" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-[90rem] px-5 pb-16 pt-32 sm:px-8 sm:pb-20 lg:px-14 lg:pb-24 lg:pt-44">
            <div className="max-w-[52rem]">
              <p className="bc-hero__eyebrow bc-rise" style={{ ["--bc-delay" as string]: "80ms" }}>
                <span className="bc-eyebrow__line" aria-hidden="true" />
                <span>
                  {BC_HERO.eyebrow.split(" | ")[0]}
                  <span className="bc-eyebrow__sep" aria-hidden="true" />
                  <span className="sr-only"> | </span>
                  {BC_HERO.eyebrow.split(" | ")[1]}
                </span>
              </p>
              <h1 id="bc-hero-title" className="bc-hero__title mt-6 font-display bc-c-w">
                <span className="bc-rise block" style={{ ["--bc-delay" as string]: "180ms" }}>{BC_HERO.headlineLines[0]}</span>
                <span className="bc-rise block italic bc-c-gold-soft" style={{ ["--bc-delay" as string]: "300ms" }}>{BC_HERO.headlineLines[1]}</span>
              </h1>
              <p className="bc-rise mt-7 max-w-[38rem] text-[1.0625rem] leading-relaxed bc-c-w80 sm:text-lg" style={{ ["--bc-delay" as string]: "440ms" }}>
                {BC_HERO.copy}
              </p>
              <div className="bc-rise mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4" style={{ ["--bc-delay" as string]: "560ms" }}>
                <a href={`#${BUSINESS_CLASS_ENQUIRY_ANCHOR}`} className="bc-btn-primary">
                  {BC_HERO.primaryCta}
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <a href="#bc-services" className="bc-btn-ghost">{BC_HERO.secondaryCta}</a>
              </div>
            </div>
          </div>
          {hero.kind === "licensed" && hero.credit ? (
            <p className="absolute bottom-3 right-4 text-[0.6875rem] bc-c-w45 sm:right-8">
              Photo: <Link href="/photo-credits/" className="underline underline-offset-2 bc-hover-w80">{hero.credit}</Link>
            </p>
          ) : null}
          <span className="bc-scroll-cue absolute bottom-8 left-1/2 hidden -translate-x-1/2 lg:block" aria-hidden="true" />
        </section>

        {/* ---------------- Introduction (light) ---------------- */}
        <section className="bc-light relative bc-bg-ivory bc-c-n" aria-labelledby="bc-intro-title">
          <div className="mx-auto grid max-w-[90rem] gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-12 lg:gap-10 lg:px-14 lg:py-40">
            <BcReveal className="lg:col-span-6 lg:pr-10">
              <Eyebrow tone="navy">{BC_INTRO.eyebrow}</Eyebrow>
              <h2 id="bc-intro-title" className="mt-6 font-display text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-[4.5rem]">
                {BC_INTRO.headline}
              </h2>
              {BC_INTRO.paragraphs.map((p) => (
                <p key={p.slice(0, 24)} className="mt-7 max-w-xl text-lg leading-[1.75] bc-c-n75">{p}</p>
              ))}
              <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-[#071C38]/15 pt-8">
                {BC_INTRO.facts.map((f) => (
                  <div key={f.label}>
                    <dt className="sr-only">{f.label}</dt>
                    <dd className="font-display text-4xl font-medium bc-c-n sm:text-5xl">{f.value}</dd>
                    <dd className="mt-2 text-[0.8125rem] leading-snug bc-c-n65">{f.label}</dd>
                  </div>
                ))}
              </dl>
            </BcReveal>
            <BcReveal className="relative lg:col-span-6" delay={120}>
              <div className="bc-frame relative aspect-[4/5] sm:aspect-[3/2] lg:aspect-[4/5]">
                <BcPicture photo={BC_PHOTOS.intro} sizes="(min-width: 1024px) 45vw, 100vw" className="absolute inset-0 h-full w-full object-cover" />
              </div>
            </BcReveal>
          </div>
        </section>

        {/* ---------------- Services (dark) ---------------- */}
        <section id="bc-services" className="relative scroll-mt-20 bc-bg-midnight bc-c-w" aria-labelledby="bc-services-title">
          <div className="mx-auto max-w-[90rem] px-5 pt-24 sm:px-8 sm:pt-32 lg:px-14 lg:pt-40">
            <BcReveal className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7">
                <Eyebrow>Executive services</Eyebrow>
                <h2 id="bc-services-title" className="mt-6 font-display text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-[4.5rem]">
                  Three ways to travel, <span className="italic bc-c-gold-soft">one standard.</span>
                </h2>
              </div>
              <p className="max-w-md text-lg leading-relaxed bc-c-w65 lg:col-span-5 lg:justify-self-end">
                From the airport kerb to the boardroom door, every journey is arranged personally and confirmed in advance.
              </p>
            </BcReveal>
          </div>

          {/* 01 — Airport: wide image left, text right */}
          <article id={airport.id} className="mx-auto mt-20 grid max-w-[90rem] scroll-mt-24 gap-10 px-5 sm:px-8 lg:mt-28 lg:grid-cols-12 lg:items-center lg:gap-14 lg:px-14" aria-labelledby={`${airport.id}-title`}>
            <BcReveal className="lg:col-span-7">
              <div className="bc-photo-card relative aspect-[3/2] overflow-hidden rounded-[1.25rem]">
                <BcPicture photo={BC_PHOTOS.airport} sizes="(min-width: 1024px) 55vw, 100vw" className="bc-zoom absolute inset-0 h-full w-full object-cover" tone="midnight" />
              </div>
              {BC_PHOTOS.airport.kind === "licensed" && BC_PHOTOS.airport.credit ? (
                <p className="mt-3 text-[0.6875rem] bc-c-w40">Photo: <Link href="/photo-credits/" className="underline underline-offset-2">{BC_PHOTOS.airport.credit}</Link></p>
              ) : null}
            </BcReveal>
            <BcReveal className="lg:col-span-5" delay={120}>
              <div id={`${airport.id}-title`}><ServiceHeader service={airport} /></div>
              <ServicePoints service={airport} />
              {airport.note ? <p className="mt-6 text-[0.9375rem] leading-relaxed bc-c-w60">{airport.note}</p> : null}
            </BcReveal>
          </article>

          {/* 02 — Corporate: text on an overlapping panel, image right */}
          <article id={corporate.id} className="relative mx-auto mt-28 max-w-[90rem] scroll-mt-24 px-5 sm:px-8 lg:mt-40 lg:px-14" aria-labelledby={`${corporate.id}-title`}>
            <div className="grid lg:grid-cols-12 lg:items-center">
              <BcReveal className="relative order-1 lg:order-2 lg:col-span-7 lg:col-start-6 lg:row-start-1">
                <div className="bc-photo-card relative aspect-[4/3] overflow-hidden rounded-[1.25rem] lg:aspect-[16/11]">
                  <BcPicture photo={BC_PHOTOS.corporate} sizes="(min-width: 1024px) 55vw, 100vw" className="bc-zoom absolute inset-0 h-full w-full object-cover" tone="midnight" />
                  {BC_PHOTOS.corporate.kind === "licensed" && BC_PHOTOS.corporate.credit ? (
                    <p className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[0.6875rem] bc-c-w85 backdrop-blur-sm">
                      Photo: <Link href="/photo-credits/" className="underline underline-offset-2 bc-c-w">{BC_PHOTOS.corporate.credit}</Link>
                    </p>
                  ) : null}
                </div>
              </BcReveal>
              <BcReveal className="relative z-10 order-2 -mt-16 mx-3 lg:order-1 lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:mx-0 lg:mt-0" delay={120}>
                <div className="bc-panel rounded-[1.25rem] p-7 sm:p-10 lg:p-12">
                  <div id={`${corporate.id}-title`}><ServiceHeader service={corporate} /></div>
                  <ul className="mt-8 flex flex-wrap gap-2.5">
                    {corporate.points.map((p) => (
                      <li key={p} className="bc-pill px-4 py-2 text-[0.9375rem] bc-c-w85">{p}</li>
                    ))}
                  </ul>
                  {corporate.note ? <p className="mt-6 text-[0.9375rem] leading-relaxed bc-c-w60">{corporate.note}</p> : null}
                </div>
              </BcReveal>
            </div>
          </article>

          {/* 03 — Private: portrait image with editorial column and large numeral */}
          <article id={privateTravel.id} className="mx-auto mt-28 grid max-w-[90rem] scroll-mt-24 gap-10 px-5 pb-24 sm:px-8 sm:pb-32 lg:mt-40 lg:grid-cols-12 lg:items-end lg:gap-14 lg:px-14 lg:pb-40" aria-labelledby={`${privateTravel.id}-title`}>
            <BcReveal className="lg:col-span-5 lg:col-start-1">
              <div className="bc-photo-card relative aspect-[4/5] overflow-hidden rounded-[1.25rem]">
                <BcPicture photo={BC_PHOTOS.private} sizes="(min-width: 1024px) 40vw, 100vw" className="bc-zoom absolute inset-0 h-full w-full object-cover" tone="midnight" />
              </div>
            </BcReveal>
            <BcReveal className="lg:col-span-6 lg:col-start-7 lg:pb-8" delay={120}>
              <div id={`${privateTravel.id}-title`}><ServiceHeader service={privateTravel} /></div>
              <ul className="mt-8 grid gap-x-8 sm:grid-cols-2">
                {privateTravel.points.map((p) => (
                  <li key={p} className="flex items-center gap-3 border-b border-white/12 py-3.5 text-[1.0625rem] bc-c-w90">
                    <span className="bc-dot" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              {privateTravel.note ? <p className="mt-6 text-[0.9375rem] leading-relaxed bc-c-w60">{privateTravel.note}</p> : null}
              <a href={`#${BUSINESS_CLASS_ENQUIRY_ANCHOR}`} className="bc-link mt-10 inline-flex">Plan a private journey</a>
            </BcReveal>
          </article>
        </section>

        {/* ---------------- Why choose (light) ---------------- */}
        <section className="bc-bg-white bc-c-n" aria-labelledby="bc-why-title">
          <div className="mx-auto max-w-[90rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-14 lg:py-40">
            <BcReveal className="max-w-3xl">
              <Eyebrow tone="navy">{BC_WHY.eyebrow}</Eyebrow>
              <h2 id="bc-why-title" className="mt-6 font-display text-[2.5rem] font-medium leading-[1.04] sm:text-6xl">
                {BC_WHY.headline}
              </h2>
            </BcReveal>
            <ul className="mt-16 grid border-t border-[#071C38]/12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3">
              {BC_WHY.items.map((item, i) => (
                <BcReveal as="li" key={item.title} delay={(i % 3) * 90} className="bc-why-item border-b border-[#071C38]/12 py-10 sm:px-8 sm:first:pl-0 lg:py-12">
                  <span className="bc-c-gold-deep"><WhyIcon name={item.icon} /></span>
                  <h3 className="mt-6 font-display text-[1.75rem] font-medium leading-tight">{item.title}</h3>
                  <p className="mt-3 max-w-sm text-base leading-relaxed bc-c-n70">{item.body}</p>
                </BcReveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- Enquiry (dark) ---------------- */}
        <section id={BUSINESS_CLASS_ENQUIRY_ANCHOR} className="bc-enquiry relative scroll-mt-16 bc-c-w" aria-labelledby="bc-enquiry-title">
          <div className="mx-auto grid max-w-[90rem] gap-14 px-4 py-24 sm:px-8 sm:py-32 lg:grid-cols-12 lg:gap-14 lg:px-14 lg:py-40">
            <div className="px-1 lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <Eyebrow>{BC_ENQUIRY.eyebrow}</Eyebrow>
                <h2 id="bc-enquiry-title" className="mt-6 font-display text-[2.75rem] font-medium leading-[1.02] sm:text-6xl">
                  Your Journey.{" "}
                  <span className="italic bc-c-gold-soft">Exceptionally Considered.</span>
                </h2>
                <p className="mt-7 max-w-md text-lg leading-relaxed bc-c-w75">{BC_ENQUIRY.copy}</p>
                <ol className="mt-10 space-y-5 border-t border-white/10 pt-8">
                  {BC_ENQUIRY.steps.map((s, i) => (
                    <li key={s} className="flex gap-5 text-[0.9375rem] leading-relaxed bc-c-w75">
                      <span className="font-display text-2xl leading-none bc-c-gold">{["i.", "ii.", "iii."][i]}</span>
                      {s}
                    </li>
                  ))}
                </ol>
                <div className="mt-10 space-y-2 text-[0.9375rem] bc-c-w65">
                  <p>
                    Prefer to talk?{" "}
                    <a className="font-semibold bc-c-w underline decoration-[#C8AD79] underline-offset-4" href={`tel:${SITE.officeLandline}`}>
                      {SITE.officeLandlineDisplay}
                    </a>{" "}
                    or{" "}
                    <a className="font-semibold bc-c-w underline decoration-[#C8AD79] underline-offset-4" href={whatsAppChatUrl()}>
                      WhatsApp
                    </a>
                  </p>
                  <p>
                    Booking a straightforward airport transfer?{" "}
                    <Link href="/#quote" className="font-semibold bc-c-em underline underline-offset-4">
                      Try our instant quote
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
            <div className="min-w-0 lg:col-span-7">
              <ExecutiveQuoteForm />
            </div>
          </div>
        </section>

        {/* ---------------- FAQ (light, compact) ---------------- */}
        <section className="bc-bg-ivory bc-c-n" aria-labelledby="bc-faq-title">
          <div className="mx-auto grid max-w-[90rem] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:px-14">
            <div className="lg:col-span-4">
              <Eyebrow tone="navy">Good to know</Eyebrow>
              <h2 id="bc-faq-title" className="mt-6 font-display text-4xl font-medium leading-tight sm:text-5xl">Business Class questions</h2>
            </div>
            <div className="divide-y divide-[#071C38]/12 border-y border-[#071C38]/12 lg:col-span-8">
              {BC_PAGE_FAQS.map((f) => (
                <details key={f.question} className="bc-faq group py-6">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-left font-display text-2xl font-medium">
                    {f.question}
                    <span className="bc-faq__icon" aria-hidden="true" />
                  </summary>
                  <p className="mt-4 max-w-2xl text-base leading-relaxed bc-c-n75">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
