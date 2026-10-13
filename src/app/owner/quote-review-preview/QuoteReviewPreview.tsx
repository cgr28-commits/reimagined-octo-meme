'use client';
import { useMemo, useState } from 'react';
import OwnerSavedQuotesPanel from '@/components/OwnerSavedQuotesPanel';
import type { SavedQuotePublicSummary } from '../../../../shared/saved-quote';
import OwnerA2aQuotesPanel from '@/components/OwnerA2aQuotesPanel';
import type { A2aQuoteOwnerSummary, A2aQuoteOwnerFilter } from '@/lib/a2a-quote-api';
import { calculateA2aReturnOffer } from '../../../../shared/a2a-personalised-quote';
const sample: A2aQuoteOwnerSummary = {
 reference:'DEMO-EXPIRED',status:'EXPIRED',statusLabel:'Expired',customerName:'Demo Customer',customerEmail:'demo@example.com',customerMobile:'07700 900000',pickupLabel:'Dublin hotel',dropoffLabel:'Amended Belfast hotel address',tripDate:'2030-12-20',tripTime:'10:00',returnJourney:false,passengers:4,suitcases:4,vehicle:'Estate',tripLabel:'Address to Address',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z',quotedPrice:80,quotedPriceLabel:'£80.00',quoteApprovedAt:'2026-10-01T10:00:00Z',quoteValidityMinutes:60,quoteValidityLabel:'1 hour',quoteExpiresAt:'2026-10-01T11:00:00Z',paymentUrl:null,paymentReference:null,paidAt:null,paymentLinkEmailSentAt:null,payable:false,
};
export default function QuoteReviewPreview() {
 const [rows,setRows]=useState([sample]);
 const [savedRows,setSavedRows]=useState<SavedQuotePublicSummary[]>([{
  reference:'MAT-DEMO',token:'a'.repeat(48),customerName:'Demo Customer',customerEmail:'demo@example.com',status:'expired',createdAt:'2026-10-01T10:00:00Z',expiresAt:'2026-10-08T10:00:00Z',expiresAtLabel:'8 October 2026',amount:80,amountLabel:'£80.00',currency:'GBP',journey:{pickupLabel:'Dublin hotel',dropoffLabel:'Amended Belfast address',isAirportTrip:false,tripDate:'',tripTime:'',returnJourney:false,passengers:4,suitcases:4,vehicle:'Estate',tripLabel:'Address to Address'},bookUrl:'#preview-only',
 }]);
 async function savedRequest(_key:string,body?:Record<string,unknown>,search?:string) {
  if(!body)return {quotes:savedRows.filter(q=>[q.reference,q.customerName,q.customerEmail].some(value=>value.toLowerCase().includes((search||'').toLowerCase())))};
  const quote=savedRows.find(q=>q.token===body.token)!;
  if(body.action==='preview-return')return {quote:{...quote,amount:152,amountLabel:'£152.00',journey:{...quote.journey,returnJourney:true,returnDate:String(body.returnDate||''),returnTime:String(body.returnTime||'')}}};
  const next:SavedQuotePublicSummary={...quote,status:'saved',expiresAt:new Date(Date.now()+Number(body.validityDays||7)*86400000).toISOString(),expiresAtLabel:'Fresh validity window'};
  if(body.action==='offer-return') {
   const offer:SavedQuotePublicSummary={...next,reference:'MAT-DEMO-RETURN',token:'b'.repeat(48),amount:152,amountLabel:'£152.00',journey:{...next.journey,returnJourney:true,returnDate:String(body.returnDate||''),returnTime:String(body.returnTime||'')}};
   setSavedRows([offer,...savedRows]);return {quote:offer,emailSent:true};
  }
  setSavedRows(savedRows.map(q=>q.token===quote.token?next:q));return {quote:next,emailSent:true};
 }
 const api=useMemo(()=>({
  list:async (_key:string,filter:A2aQuoteOwnerFilter='awaiting')=>({quotes:rows.filter(q=>filter==='all'||filter==='history'||(filter==='expired'&&q.status==='EXPIRED')||(filter==='approved'&&q.status==='QUOTE_APPROVED_AWAITING_PAYMENT')||(filter==='awaiting'&&q.status==='AWAITING_QUOTE')),awaitingCount:0}),
  update:async (_key:string,input:{reference:string;pickupLabel:string;dropoffLabel:string;tripDate:string;tripTime:string;returnJourney?:boolean;returnDate?:string;returnTime?:string;passengers?:number;suitcases?:number})=>{
   const record={...rows[0],...input};setRows([record]);return record;
  },
  approve:async (_key:string,input:{reference:string;quotedPrice:number;validityMinutes:number;returnOfferFares?:{outbound:number;inbound:number}})=>{
   const pricing=input.returnOfferFares ? calculateA2aReturnOffer(input.returnOfferFares.outbound,input.returnOfferFares.inbound)! : undefined;
   const total=pricing?.total??input.quotedPrice;
   const record={...rows[0],status:'QUOTE_APPROVED_AWAITING_PAYMENT',statusLabel:'Quote Approved – Awaiting Payment',quotedPrice:total,quotedPriceLabel:`£${total.toFixed(2)}`,returnOfferPricing:pricing,quoteValidityLabel:`${input.validityMinutes} minutes`,quoteExpiresAt:new Date(Date.now()+input.validityMinutes*60000).toISOString(),paymentLinkEmailSentAt:new Date().toISOString(),payable:true};
   setRows([record]);return {record,payUrl:'#preview-only',paymentEmailSent:true};
  },
  resend:async ()=>({record:rows[0],payUrl:'#preview-only',paymentEmailSent:true as const}),
 }),[rows]);
 return <main className="mx-auto min-h-screen max-w-4xl bg-navy px-4 py-10 text-white">
  <h1 className="text-2xl font-bold">Expired quote dashboard preview</h1>
  <p className="mb-6 mt-3 text-white/70">Sample data only. This preview never sends emails or creates payments. Try Edit journey to add a return, then reopen the quote. Refresh to reset.</p>
  <p className="mb-3 text-sm text-white/70">Try searching for MAT-DEMO below. All actions use isolated sample data.</p>
  <OwnerSavedQuotesPanel ownerKey="preview-only" request={savedRequest} />
  <div className="mt-8"><OwnerA2aQuotesPanel ownerKey="preview-only" api={api} initialFilter="expired" /></div>
 </main>;
}
