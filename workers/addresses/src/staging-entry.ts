import releaseWorker from "./index";
import {RefundCoordinator as ReleaseRefundCoordinator} from "./refund-coordinator";
import {MeetGreetCoordinator as ReleaseMeetGreetCoordinator} from "./meet-greet-upgrade-handlers";
import {isolatedEnv, verifySandbox, STAGING_NAME, RELEASE_SHA, type StagingEnv} from "./staging-isolation";
export {QuoteLeadCoordinator} from "./quote-lead-coordinator";
export {ConsentLedger} from "./consent-ledger";

export class RefundCoordinator extends ReleaseRefundCoordinator {
  private stagingEnv: StagingEnv;
  constructor(state: DurableObjectState, env: StagingEnv) {super(state, isolatedEnv(env)); this.stagingEnv=env;}
  async fetch(request: Request) {await verifySandbox(this.stagingEnv); return super.fetch(request);}
}
export class MeetGreetCoordinator extends ReleaseMeetGreetCoordinator {
  private stagingEnv: StagingEnv;
  constructor(state: DurableObjectState, env: StagingEnv) {super(state, isolatedEnv(env)); this.stagingEnv=env;}
  async fetch(request: Request) {await verifySandbox(this.stagingEnv); return super.fetch(request);}
  async alarm() {await verifySandbox(this.stagingEnv); return super.alarm();}
}

export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    try {
      const clean = isolatedEnv(env);
      const identity = await clean.TRACKING_STORE.get<{name?:string;releaseSha?:string}>("staging:identity","json");
      if (identity?.name !== STAGING_NAME || identity.releaseSha !== RELEASE_SHA) throw new Error("Unverified staging storage");
      const origin = request.headers.get("Origin");
      if (origin && origin !== clean.PUBLIC_SITE_ORIGIN) return new Response("Staging origin only",{status:403});
      await verifySandbox(clean); // No application/payment requests until merchant is verified.
      if (new URL(request.url).pathname === "/__staging/health") return Response.json({environment:STAGING_NAME,releaseSha:RELEASE_SHA,sandboxVerified:true,notifications:"captured-not-delivered",cron:"disabled"});
      const result = await releaseWorker.fetch(request, clean);
      const response = new Response(result.body,result);
      response.headers.set("X-Robots-Tag","noindex, nofollow");
      response.headers.set("X-MATNI-Environment","isolated-staging");
      return response;
    } catch {
      return Response.json({error:"Staging isolation or sandbox verification failed; request blocked."},{status:503});
    }
  },
  // No scheduled handler: production cron jobs cannot run through this entrypoint.
};
