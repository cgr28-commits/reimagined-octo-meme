// Retained for compatibility with the already-applied v4 migration.
/** Irrevocable, strongly consistent withdrawal tombstones; no customer/click data. */
const RETENTION_MS = 180 * 86400_000;
export class ConsentLedger implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/withdraw") {
      await this.ctx.blockConcurrencyWhile(async () => {
        if ((await this.ctx.storage.get<number>("withdrawnAt")) === undefined) {
          const now = Date.now();
          await this.ctx.storage.put("withdrawnAt", now);
          await this.ctx.storage.setAlarm(now + RETENTION_MS);
        }
      });
      return Response.json({ revoked: true });
    }
    if (request.method === "GET" && path === "/status")
      return Response.json({ revoked: (await this.ctx.storage.get("withdrawnAt")) !== undefined });
    return new Response(null, { status: 405 });
  }
  async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
}
