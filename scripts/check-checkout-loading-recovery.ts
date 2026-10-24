import assert from "node:assert/strict";
import { createPaymentCheckout } from "../src/lib/create-payment";
import { clearPaymentPending, hasUncertainPayment, PaymentOutcomeUncertainError } from "../src/lib/payment-attempt-guard";
const originalFetch = globalThis.fetch;
const storage = new Map<string,string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable:true, value: {
  getItem: (key:string) => storage.get(key) ?? null,
  setItem: (key:string,value:string) => storage.set(key,value),
  removeItem: (key:string) => storage.delete(key),
} });
async function main() {
  try {
    for (const outcome of ["network","invalid-json","primitive-json","missing-id","server-error","in-progress"]) {
      clearPaymentPending(); let requests = 0;
      globalThis.fetch = async () => {
        requests++;
        if (outcome === "network") throw new TypeError("Network lost");
        if (outcome === "invalid-json") return new Response("invalid");
        if (outcome === "primitive-json") return Response.json(true);
        if (outcome === "missing-id") return Response.json({paymentUrl:"https://checkout.sumup.com/mock"});
        if (outcome === "server-error") return Response.json({error:"Uncertain"},{status:502});
        return Response.json({code:"payment_in_progress"},{status:409});
      };
      const request = {amount:60,description:"Isolated test",shortNoticeToken:"mock-token"};
      await assert.rejects(() => createPaymentCheckout(request), PaymentOutcomeUncertainError);
      assert.equal(hasUncertainPayment(),true);
      await assert.rejects(() => createPaymentCheckout(request), PaymentOutcomeUncertainError);
      assert.equal(requests,1,"An uncertain outcome must never repeat the POST");
    }
    for (const outcome of ["rejected","route-unavailable","success"]) {
      clearPaymentPending();
      globalThis.fetch = async () => outcome === "success"
        ? Response.json({checkoutId:"mock",paymentUrl:"https://checkout.sumup.com/mock"})
        : Response.json({code:outcome === "rejected" ? "vehicle_unavailable" : "route_service_unavailable",error:"Safe validation rejection"},{status:outcome === "rejected" ? 409 : 503});
      const request = {amount:60,description:"Isolated test",shortNoticeToken:"mock-token"};
      if (outcome === "success") assert.equal((await createPaymentCheckout(request)).checkoutId,"mock");
      else await assert.rejects(() => createPaymentCheckout(request));
      assert.equal(hasUncertainPayment(),false,"Definite outcomes release the local safety marker");
    }
    console.log("PASS network, malformed, missing ID, 502, in-progress, safe validation rejection and successful recovery gates; no external calls");
  } finally { globalThis.fetch=originalFetch; delete (globalThis as {sessionStorage?:Storage}).sessionStorage; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
