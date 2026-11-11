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
 // An earlier payment page that was closed unpaid (customer changed the booking, then
 // changed back) is replaced by a fresh one; a still-open one is never replaced.
 let made=0; const make=(digest:string,closed:boolean)=>runPaymentOperation({namespace,key:"flip-back",digest,run:async()=>({checkoutId:`page-${++made}`}),retrySafe:()=>false,closedUnpaid:async()=>closed});
 assert.equal((await make("saloon-1",false)).result.checkoutId,"page-1");
 await assert.rejects(()=>make("saloon-2",false),PaymentOperationBusy);assert.equal(made,1);
 const again=await make("saloon-2",true);assert.equal(again.reused,false);assert.equal(again.result.checkoutId,"page-2");
 assert.equal((await make("saloon-2",false)).result.checkoutId,"page-2");assert.equal(made,2);
 console.log("PASS durable operation concurrency, cached checkout reuse, changed-amount rejection, safe pre-payment retries, fresh page after an unpaid closed one and no repeated uncertain provider operation");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
