import { GOOGLE_REVIEWS, SITE } from "@/lib/data";
import SectionHeading from "./SectionHeading";

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < rating;
        return (
          <svg
            key={index}
            className={`h-4 w-4 ${filled ? "text-[#fbbc04]" : "text-white/20"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
    </div>
  );
}

function GoogleGMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function GoogleReviewsSection() {
  return (
    <section id="reviews" className="relative border-y border-white/10 py-14 sm:py-16">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-dark/80 via-navy to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:flex-row sm:px-8">
          <div className="flex items-center gap-4">
            <GoogleGMark className="h-9 w-9 shrink-0" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/50">
                Google Reviews
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <StarRow rating={5} />
                <p className="text-sm text-white/75">
                  Rated by travellers across Northern Ireland
                </p>
              </div>
            </div>
          </div>
          <a
            href={SITE.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-emerald/40 hover:text-emerald"
          >
            See us on Google
          </a>
        </div>

        <div className="mt-10">
          <SectionHeading
            eyebrow="Traveller feedback"
            title="What customers say"
            description="Recent feedback from airport transfer passengers — punctual drivers, clear prices, and a calm journey."
          />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {GOOGLE_REVIEWS.map((review) => (
            <article
              key={review.author}
              className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <StarRow rating={review.rating} />
                <span className="text-xs font-medium text-white/40">{review.source}</span>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-white/80">
                &ldquo;{review.text}&rdquo;
              </p>
              <p className="mt-5 text-sm font-semibold text-white">{review.author}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
