import assert from "node:assert/strict";
import {isolatedPaymentCoordinator} from "./fixtures/payment-coordinator";
import {runPaymentOperation,PaymentOperationBusy} from "../workers/addresses/src/payment-operation";
async function main() {
 const namespace=isolatedPaymentCoordinator();let effects=0;
 const run=()=>runPaymentOperation({namespace,key:"payment-create:test",digest:"amount-65",run:async()=>{effects++;await new Promise(resolve=>setTimeout(resolve,10));return {checkoutId:"isolated"};},retrySafe:()=>false});
 const pair=await Promise.allSettled([run(),run()]);
 assert.equal(pair.filter(x=>x.status==="fulfilled").length,1);assert.equal(effects,1);
 assert.equal((await run()).reused,true);assert.equal(effects,1);
 await assert.rejects(()=>runPaymentOperation({namespace,key:"payment-create:test",digest:"amount-1",run:async()=>{throw Error("must not run");},retrySafe:()=>false}),PaymentOperationBusy);
 let uncertain=0;
 const fail=()=>runPaymentOperation({namespace,key:"uncertain",run:async()=>{uncertain++;throw Error("provider timeout after possible acceptance");},retrySafe:()=>false});
 await assert.rejects(fail);await assert.rejects(fail,PaymentOperationBusy);assert.equal(uncertain,1);
 for(let i=0;i<2;i++) assert.equal((await runPaymentOperation({namespace,key:"not-paid",run:async()=>({paid:false}),retrySafe:()=>true})).reused,false);
 console.log("PASS durable operation concurrency, cached checkout reuse, changed-amount rejection, safe pre-payment retries and no repeated uncertain provider operation");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
