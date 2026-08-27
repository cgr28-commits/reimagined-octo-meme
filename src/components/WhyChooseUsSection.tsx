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
          navId="why-us"
          description="Clear fixed quotes, flight monitoring, and complimentary waiting — without the guesswork."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-7">
          {WHY_CHOOSE_US.map((item) => (
            <article
              key={item.title}
              className="border-t border-white/12 pt-6 transition-colors sm:border sm:rounded-2xl sm:border-white/10 sm:bg-white/[0.025] sm:p-7 sm:pt-7"
            >
              <h3 className="font-display text-xl font-semibold tracking-tight text-white">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/62">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
