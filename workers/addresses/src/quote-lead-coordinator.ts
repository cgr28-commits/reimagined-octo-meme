/**
 * Per-fingerprint quote / contact email claim (Cloudflare Durable Object).
 *
 * Storage is strongly consistent. `blockConcurrencyWhile` serialises claim and
 * release so concurrent Worker requests cannot both send the same email.
 * The lock is never held across Resend / operational-email I/O.
 */

export class QuoteLeadCoordinator implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.replace(/^\//, "") || "claim";

    if (action === "claim") {
      const claimed = await this.ctx.blockConcurrencyWhile(async () => {
        const existing = await this.ctx.storage.get<string>("claimed");
        if (existing) {
          return false;
        }
        await this.ctx.storage.put("claimed", "1");
        return true;
      });
      return Response.json({ claimed });
    }

    if (action === "peek") {
      const existing = await this.ctx.storage.get<string>("claimed");
      return Response.json({ claimed: Boolean(existing) });
    }

    if (action === "release") {
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.ctx.storage.delete("claimed");
      });
      return Response.json({ released: true });
    }

    return new Response("Not found", { status: 404 });
  }
}

export type QuoteLeadCoordinatorNamespace = DurableObjectNamespace;

export async function coordinatorClaim(
  ns: QuoteLeadCoordinatorNamespace,
  fingerprint: string,
): Promise<boolean> {
  const stub = ns.get(ns.idFromName(fingerprint));
  const response = await stub.fetch("https://quote-lead-coordinator/claim", {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as { claimed?: unknown } | null;
  return payload?.claimed === true;
}

export async function coordinatorPeek(
  ns: QuoteLeadCoordinatorNamespace,
  fingerprint: string,
): Promise<boolean> {
  const stub = ns.get(ns.idFromName(fingerprint));
  const response = await stub.fetch("https://quote-lead-coordinator/peek");
  const payload = (await response.json().catch(() => null)) as { claimed?: unknown } | null;
  return payload?.claimed === true;
}

export async function coordinatorRelease(
  ns: QuoteLeadCoordinatorNamespace,
  fingerprint: string,
): Promise<void> {
  const stub = ns.get(ns.idFromName(fingerprint));
  await stub.fetch("https://quote-lead-coordinator/release", { method: "POST" });
}
