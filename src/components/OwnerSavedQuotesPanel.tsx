'use client';
import { useState } from 'react';
import { resolveWorkerBaseUrl } from '@/lib/worker-api';
import type { SavedQuotePublicSummary } from '../../shared/saved-quote';
type Quote = SavedQuotePublicSummary & {lastEmailError?:string};
type Result = {quotes?:Quote[];quote?:Quote;emailSent?:boolean;emailError?:string};
export async function ownerSavedQuoteRequest(ownerKey: string,body?:Record<string,unknown>,search?:string): Promise<Result> {
 const url=new URL(`${resolveWorkerBaseUrl()}/owner/saved-quotes`);if(search)url.searchParams.set('search',search);
 const response=await fetch(url,{method:body?'POST':'GET',headers:{'X-Owner-Key':ownerKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error || 'Could not update quote.');return data;
}
export default function OwnerSavedQuotesPanel({ownerKey,request=ownerSavedQuoteRequest}:{ownerKey:string;request?:typeof ownerSavedQuoteRequest}) {
 const [search,setSearch]=useState(''),[quotes,setQuotes]=useState<Quote[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [review,setReview]=useState<{token:string;action:'reopen'|'offer-return';quote:Quote}|null>(null);
 const [days,setDays]=useState('7'),[returnDate,setReturnDate]=useState(''),[returnTime,setReturnTime]=useState('');
 const input='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-white/20 bg-navy px-3 py-2 text-white [color-scheme:dark]';
 async function find(event:React.FormEvent) {event.preventDefault();setBusy(true);setError('');setMessage('');setReview(null);try {const result=await request(ownerKey,undefined,search.trim());setQuotes(result.quotes || []);if(!result.quotes?.length)setMessage('No retained saved quotes found. Try the reference or customer email. Records are retained for 30 days.');}catch(e){setError(e instanceof Error?e.message:'Could not find quotes.');}finally{setBusy(false);}}
 async function act(quote:Quote,action:string) {setBusy(true);setError('');setMessage('');try {
  const result=await request(ownerKey,{token:quote.token,action,validityDays:Number(days),returnDate,returnTime});
  if(action==='preview-return'&&result.quote) {setReview({token:quote.token,action:'offer-return',quote:result.quote});return;}
  if(result.quote)setQuotes(prev=>action==='offer-return'?[result.quote!,...prev]:prev.map(q=>q.token===quote.token?result.quote!:q));
  setReview(null);setMessage(result.emailSent?`Quote ${result.quote?.reference} emailed to ${result.quote?.customerEmail}.`:'Quote saved, but email failed. Use Resend quote email.');if(result.emailError)setError(result.emailError);
 }catch(e){setError(e instanceof Error?e.message:'Could not update quote.');}finally{setBusy(false);}}
 return <section className="min-w-0 rounded-2xl border border-white/15 bg-navy p-4 text-white sm:p-6">
  <h2 className="text-xl font-bold">Saved quotes — reopen & resend</h2>
  <p className="mt-2 text-sm text-white/70">Find an expired saved quote by its MAT reference, customer name or email. Reopening preserves the journey, amended addresses and agreed price.</p>
  <form onSubmit={find} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm">Quote reference, customer name or email<input value={search} onChange={e=>setSearch(e.target.value)} required minLength={3} className={input} /></label><button disabled={busy} className="min-h-11 rounded-xl bg-emerald px-4 py-2 font-semibold text-navy disabled:opacity-50">{busy?'Working…':'Find quote'}</button></form>
  {error?<p role="alert" className="mt-3 break-words text-red-200">{error}</p>:null}{message?<p role="status" className="mt-3 break-words text-emerald">{message}</p>:null}
  <div className="mt-5 space-y-4">{quotes.map(quote=><article key={quote.token} className="min-w-0 rounded-xl border border-white/15 p-4">
   <p className="text-xs uppercase text-amber-200">{quote.status}</p><h3 className="mt-1 break-words font-bold">{quote.customerName} · {quote.reference}</h3><p className="break-all text-sm text-white/70">{quote.customerEmail}</p>
   <p className="mt-3 break-words">{quote.journey.pickupLabel} → {quote.journey.dropoffLabel}</p><p className="mt-2 text-sm text-white/70">{quote.journey.passengers} passengers · {quote.journey.suitcases} suitcases · {quote.journey.vehicle}</p>
   <p className="mt-3 text-lg font-bold">Fixed price {quote.amountLabel}</p><p className="text-sm text-white/60">{quote.journey.returnJourney?'Return journey':'One way'} · expires {quote.expiresAtLabel}</p>
   {quote.status!=='booked'?<div className="mt-4 flex flex-wrap gap-3">
    {quote.status==='expired'?<button disabled={busy} onClick={()=>{setReview({token:quote.token,action:'reopen',quote});setDays('7');}} className="min-h-11 rounded-xl bg-emerald px-4 font-semibold text-navy">Reopen quote</button>:<button disabled={busy} onClick={()=>void act(quote,'resend')} className="min-h-11 rounded-xl bg-emerald px-4 font-semibold text-navy">Resend quote email</button>}
    {!quote.journey.returnJourney?<button disabled={busy} onClick={()=>void act(quote,'preview-return')} className="min-h-11 rounded-xl border border-emerald px-4 text-emerald">Preview return offer — 5% discount</button>:null}
   </div>:<p className="mt-3 text-white/60">Already booked — reopening and quote emails are disabled.</p>}
   {review?.token===quote.token?<div className="mt-4 rounded-xl border border-emerald/40 bg-emerald/5 p-4">
    <h4 className="font-bold">{review.action==='reopen'?'Review reopened quote':'Review return offer'}</h4>
    <p className="mt-2 break-words">{review.quote.journey.pickupLabel} → {review.quote.journey.dropoffLabel}</p>
    <p className="mt-2 font-bold">{review.action==='offer-return'?'Fixed price for both journeys':'Agreed fixed price'}: {review.quote.amountLabel}</p>
    {review.action==='reopen'?<label className="mt-3 block text-sm">New validity (days)<input type="number" min={1} max={30} step={1} value={days} onChange={e=>setDays(e.target.value)} className={input}/></label>:<>
     <p className="mt-2 text-sm text-white/70">The existing return pricing applies the 5% fare discount once. Airport/access charges are not discounted. The return runs from the destination back to the pickup.</p>
     <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Return date (optional)<input type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)} className={input}/></label><label className="text-sm">Return time (optional)<input type="time" value={returnTime} onChange={e=>setReturnTime(e.target.value)} className={input}/></label></div>
     <p className="mt-2 text-xs text-white/60">Leave both blank for the customer to choose before paying.</p><button disabled={busy} onClick={()=>void act(quote,'preview-return')} className="mt-3 min-h-11 text-emerald underline">Refresh return preview</button>
    </>}
    <p className="mt-3 break-words text-sm">Email will go to {quote.customerEmail}. Your customer can review the journey before booking.</p>
    <div className="mt-3 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void act(quote,review.action)} className="min-h-11 rounded-xl bg-emerald px-4 font-semibold text-navy">{busy?'Sending…':review.action==='reopen'?'Reopen & email customer':'Create return quote & email customer'}</button><button disabled={busy} onClick={()=>setReview(null)} className="min-h-11 px-3 text-white/70">Cancel</button></div>
   </div>:null}
  </article>)}</div>
 </section>;
}
