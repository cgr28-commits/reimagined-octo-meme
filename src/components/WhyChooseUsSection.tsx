import { WHY_CHOOSE_US } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function WhyChooseUsSection() {
  return (
    <section id="why-us" className="relative py-24 sm:py-32">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Our Service"
          title="Why Choose Us"
          description="Reliable airport transfers across Northern Ireland — with clear quotes, professional drivers, and no hidden extras."
        />

        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_CHOOSE_US.map((item) => (
            <article key={item.title} className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-semibold tracking-tight text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
