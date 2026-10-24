/** Executes the real Durable Object with isolated strongly-consistent in-memory storage. */
import {QuoteLeadCoordinator} from "../../workers/addresses/src/quote-lead-coordinator";
export function isolatedPaymentCoordinator(): DurableObjectNamespace {
  const objects=new Map<string, QuoteLeadCoordinator>();
  return {
    idFromName:(name:string)=>name,
    get:(id:string)=>{
      if(!objects.has(id)) {
        const data=new Map<string,unknown>(); let queue=Promise.resolve();
        const state={storage:{get:async(k:string)=>data.get(k),put:async(k:string,v:unknown)=>{data.set(k,structuredClone(v));},delete:async(k:string)=>data.delete(k),deleteAll:async()=>data.clear(),setAlarm:async()=>{}},blockConcurrencyWhile:<T>(fn:()=>Promise<T>):Promise<T>=>{const next=queue.then(fn);queue=next.then(()=>{},()=>{});return next;}};
        objects.set(id,new QuoteLeadCoordinator(state as unknown as DurableObjectState));
      }
      return {fetch:(input:string|Request,init?:RequestInit)=>objects.get(id)!.fetch(new Request(input,init))};
    },
  } as unknown as DurableObjectNamespace;
}
