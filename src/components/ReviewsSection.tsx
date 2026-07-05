import { REVIEWS } from "@/lib/data";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < rating ? "text-yellow-400" : "text-white/20"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsSection() {
  const averageRating = 5.0;

  return (
    <section id="reviews" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
            Testimonials
          </p>
          <h2 className="section-heading mx-auto mt-2 text-3xl font-bold text-white sm:text-4xl">
            Google Reviews
          </h2>

          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4">
            <div className="flex items-center gap-2">
              <svg className="h-8 w-8" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">{averageRating.toFixed(1)}</p>
                <StarRating rating={5} />
              </div>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <p className="text-sm text-white/60">
              Based on <span className="font-semibold text-white">200+</span> Google reviews
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REVIEWS.map((review) => (
            <article
              key={review.name}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/20 hover:bg-white/[0.05]"
            >
              <div className="flex items-center justify-between">
                <StarRating rating={review.rating} />
                <span className="text-xs text-white/40">{review.date}</span>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-white/70">
                &ldquo;{review.text}&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald/20 text-sm font-bold text-emerald">
                  {review.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{review.name}</p>
                  <p className="text-xs text-white/40">Google Review</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
