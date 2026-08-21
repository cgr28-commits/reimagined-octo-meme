import { WHY_CHOOSE_US } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function WhyChooseUsSection() {
  return (
    <section id="why-us" className="relative scroll-mt-36 py-20 sm:py-28 lg:py-32 xl:scroll-mt-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="Our Service"
          title="Why Choose Us"
          description="Clear fixed quotes, flight monitoring, and complimentary waiting — without the guesswork."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-7">
          {WHY_CHOOSE_US.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/20 hover:bg-white/[0.05]"
            >
              <h3 className="text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
