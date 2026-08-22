/**
 * Shared cancel bus so menu navigation and quote-form scrolls do not compete.
 */

type CancelFn = () => void;

const jobs = new Set<CancelFn>();
let generation = 0;

/** Register a cancellable scroll/focus job. Returns a dispose function. */
export function trackScrollJob(cancel: CancelFn): CancelFn {
  jobs.add(cancel);
  return () => {
    cancel();
    jobs.delete(cancel);
  };
}

/** Cancel every outstanding scroll/focus timer and animation frame job. */
export function cancelCompetingScrollJobs(): void {
  generation += 1;
  for (const cancel of [...jobs]) {
    try {
      cancel();
    } catch {
      // ignore
    }
  }
  jobs.clear();
}

export function getScrollJobGeneration(): number {
  return generation;
}

export function isScrollJobGenerationCurrent(expected: number): boolean {
  return expected === generation;
}
