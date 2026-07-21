import { CHAUFFEUR_SERVICES } from "@/lib/data";
import ChauffeurBookingCta from "./ChauffeurBookingCta";
import SectionHeading from "./SectionHeading";

export default function ChauffeurSection() {
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

        <ChauffeurBookingCta />
      </div>
    </section>
  );
}
