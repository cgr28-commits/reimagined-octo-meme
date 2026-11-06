/** Test-only stand-in for next/dynamic (client-only lazy component). */
import { lazy, Suspense, type ComponentType } from "react";

export default function dynamic<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  options?: { loading?: () => React.ReactNode },
) {
  const Lazy = lazy(async () => {
    const mod = await loader();
    return "default" in (mod as object) ? (mod as { default: ComponentType<P> }) : { default: mod as ComponentType<P> };
  });
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={options?.loading?.() ?? null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
