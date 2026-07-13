import { CHAUFFEUR_SERVICES, SITE } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function ChauffeurSection() {
  const whatsappMessage =
    "Hi, I'd like a quote for chauffeur / executive private hire. Please let me know availability and price.";

  return (
    <section id="chauffeur" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Executive Travel"
          title="Chauffeur & private hire"
          description="Professional private hire for business travel, special occasions, and as-directed journeys across Northern Ireland — with the same reliable service as our airport transfers."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CHAUFFEUR_SERVICES.map((service) => (
            <article
              key={service.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/20 hover:bg-white/[0.05]"
            >
              <h3 className="text-lg font-bold text-white">{service.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{service.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:p-10">
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/70">
            Your professional driver, your schedule, door to door. Get a personalised quote via
            WhatsApp — hourly hire, point-to-point journeys, and executive airport transfers
            available.
          </p>
          <a
            href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
          >
            Request chauffeur quote
          </a>
        </div>
      </div>
    </section>
  );
}
