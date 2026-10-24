/** Serialize external side effects using the existing strongly-consistent coordinator.
 * No lease timeout: an uncertain payment/send must be reconciled, never repeated blindly.
 */
export class PaymentOperationBusy extends Error {}
export async function paymentOperationHash(value: unknown): Promise<string> {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function runPaymentOperation<T>(input: {
  namespace?:DurableObjectNamespace; key:string; digest?:string;
  run:()=>Promise<T>; retrySafe:(result:T)=>boolean;
}):Promise<{result:T; reused:boolean}> {
  // Existing local/test installations can omit coordinators; production release
  // preflight explicitly requires this binding. Never fall back after a DO error.
  if (!input.namespace) return {result:await input.run(),reused:false};
  const stub=input.namespace.get(input.namespace.idFromName(input.key));
  const token=crypto.randomUUID(),digest=input.digest ?? input.key;
  const call=async(action:string,body:unknown)=>{
    const response=await stub.fetch(`https://payment-operation/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok) throw new Error("Payment coordination unavailable");
    return response.json() as Promise<{state?:string;digest?:string;result?:T}>;
  };
  const claim=await call("operation-begin",{token,digest});
  if(claim.state === "complete") {
    if(claim.digest !== digest) throw new PaymentOperationBusy("Payment details changed after checkout started. Please complete or contact us about the existing payment.");
    return {result:claim.result as T,reused:true};
  }
  if(claim.state !== "acquired") throw new PaymentOperationBusy("This payment is already being processed. Please wait before checking again; do not make another payment.");
  const result=await input.run(); // On throw, retain the claim for manual reconciliation.
  await call("operation-finish",{token,digest,result,retrySafe:input.retrySafe(result)});
  return {result,reused:false};
}
