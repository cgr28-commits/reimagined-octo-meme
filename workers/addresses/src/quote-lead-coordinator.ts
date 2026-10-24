/**
 * Per-fingerprint quote / contact email claim (Cloudflare Durable Object).
 *
 * Storage is strongly consistent. `blockConcurrencyWhile` serialises claim and
 * release so concurrent Worker requests cannot both send the same email.
 * The lock is never held across Resend / operational-email I/O.
 */

export class QuoteLeadCoordinator implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async alarm() { await this.ctx.storage.deleteAll(); }

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.replace(/^\//, "") || "claim";

    // Payment operations use their own hashed object IDs. Claims are persistent:
    // an interrupted external operation is never automatically repeated.
    if (action === "operation-begin" || action === "operation-finish") {
      const body = await request.json() as {token:string; digest:string; result?:unknown; retrySafe?:boolean};
      return this.ctx.blockConcurrencyWhile(async () => {
        type Operation = {token:string; digest:string; result?:unknown; complete?:boolean};
        const existing = await this.ctx.storage.get<Operation>("operation");
        if (action === "operation-begin") {
          if (existing) return Response.json(existing.complete
            ? {state:"complete", digest:existing.digest, result:existing.result}
            : {state:"busy"});
          await this.ctx.storage.put("operation", {token:body.token,digest:body.digest});
          return Response.json({state:"acquired"});
        }
        if (!existing || existing.token !== body.token) return new Response("Claim mismatch",{status:409});
        if (body.retrySafe) await this.ctx.storage.delete("operation");
        else {
          await this.ctx.storage.put("operation", {...existing,result:body.result,complete:true});
          await this.ctx.storage.setAlarm(Date.now() + 60 * 86400000);
        }
        return Response.json({ok:true});
      });
    }

    if (action === "limit") {
      const allowed = await this.ctx.blockConcurrencyWhile(async () => {
        const now = Date.now();
        const current = await this.ctx.storage.get<{ count: number; until: number }>("rate");
        const rate = current && current.until > now ? current : { count: 0, until: now + 3600000 };
        if (rate.count >= 60) return false;
        rate.count++;
        await this.ctx.storage.put("rate", rate);
        await this.ctx.storage.setAlarm(rate.until);
        return true;
      });
      return Response.json({ allowed });
    }
    if (action === "claim") {
      const claimed = await this.ctx.blockConcurrencyWhile(async () => {
        const existing = await this.ctx.storage.get<string>("claimed");
        if (existing) {
          return false;
        }
        await this.ctx.storage.put("claimed", "1");
        if (new URL(request.url).searchParams.get("expires") === "true") {
          await this.ctx.storage.setAlarm(Date.now() + 60 * 86400000);
        }
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
  const response = await stub.fetch(`https://quote-lead-coordinator/claim${fingerprint.startsWith("booking-started:") ? "?expires=true" : ""}`, {
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
