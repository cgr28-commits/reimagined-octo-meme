import Link from "next/link";

export type LandingCrumb = {
  name: string;
  href?: string;
};

export default function LandingBreadcrumbs({ items }: { items: LandingCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mt-6 text-sm text-white/60">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="text-white/30">
                  /
                </span>
              ) : null}
              {last || !item.href ? (
                <span className={last ? "text-white/80" : undefined}>{item.name}</span>
              ) : (
                <Link href={item.href} className="transition-colors hover:text-emerald">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
