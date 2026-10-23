/** Bound the whole operation, including response-body reads and retries. */
export async function withRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new DOMException("Request cancelled", "AbortError"));
      controller.abort();
    };
    if (parentSignal?.aborted) {
      onAbort();
      return;
    }
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      // Reject first so a timeout remains distinguishable from superseded input.
      reject(new DOMException("Request timed out", "TimeoutError"));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      interrupted,
      // Do not start work when the caller already cancelled.
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
        return run(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) parentSignal?.removeEventListener("abort", onAbort);
  }
}
