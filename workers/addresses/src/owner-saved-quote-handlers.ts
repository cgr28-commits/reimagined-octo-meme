import { ownerAuthorized, type DriverAuthEnv } from './driver-auth';
import { getSavedQuoteByToken, saveSavedQuoteRecord, createSavedQuote } from './saved-quote-store';
import { buildAuthoritativeSavedQuotePricing, type SavedQuoteEnv } from './saved-quote-handlers';
import { suppressSavedQuoteReminderForBookedJourney } from './saved-quote-booking-match';
import { buildSavedQuoteInitialEmail } from '../shared/saved-quote-emails';
import { toSavedQuotePublicSummary, isSavedQuoteExpired, type SavedQuoteRecord } from '../shared/saved-quote';
import { loadOwnerPricingOrDefault } from './owner-pricing-handlers';
import { trySendBrandedCustomerEmail } from './worker-email';
import { getSumUpCheckout, isSumUpCheckoutPaid } from '../shared/sumup-checkout';
import { parseLondonLocalDateTime } from '../shared/uk-time';
import { corsHeaders } from '../shared/google-places';
type Env = SavedQuoteEnv & DriverAuthEnv & { SUMUP_API_KEY?: string };
function response(data: unknown,status: number,origin: string|null) {return Response.json(data,{status,headers:corsHeaders(origin)});}
function view(record: SavedQuoteRecord,env: Env) {return {...toSavedQuotePublicSummary(record,env.SITE_ORIGIN || 'https://www.myairporttaxini.co.uk'),status:record.status==='saved'&&isSavedQuoteExpired(record)?'expired':record.status,lastEmailError:record.lastEmailError};}
/** Owner lookup includes retained expired records, which are absent from the cron open index. */
export async function findOwnerSavedQuotes(store: KVNamespace,search: string): Promise<SavedQuoteRecord[]> {
 const wanted=search.trim().toLowerCase();if(!wanted)return [];
 const found: SavedQuoteRecord[]=[];let cursor: string|undefined;
 do {
  const page=await store.list({prefix:'saved-quote:token:',cursor,limit:100});
  const records=await Promise.all(page.keys.map(key=>getSavedQuoteByToken(store,key.name.slice('saved-quote:token:'.length))));
  for(const record of records) {
   if(record && (record.reference.toLowerCase()===wanted || record.customerEmail.toLowerCase()===wanted || record.customerName.toLowerCase().includes(wanted))) found.push(record);
  }
  cursor=page.list_complete?undefined:page.cursor;
 } while(cursor);
 return found.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
}
export async function handleOwnerSavedQuotes(request: Request,env: Env,origin: string|null): Promise<Response> {
 if(!ownerAuthorized(request,env))return response({error:'Owner access required.'},401,origin);
 if(request.method==='GET') {
  const search=new URL(request.url).searchParams.get('search')?.trim() || '';
  if(search.length<3)return response({error:'Enter a quote reference, customer name or email.'},400,origin);
  const records=await findOwnerSavedQuotes(env.TRACKING_STORE,search);
  return response({quotes:records.map(record=>view(record,env))},200,origin);
 }
 if(request.method!=='POST')return response({error:'Method not allowed.'},405,origin);
 let body: Record<string,unknown>;try {body=await request.json();}catch{return response({error:'Invalid request.'},400,origin);}
 const record=await getSavedQuoteByToken(env.TRACKING_STORE,String(body.token ?? ''));
 if(!record)return response({error:'Quote not found. Saved quotes are retained for 30 days.'},404,origin);
 if(record.status==='booked'||record.paymentReference||record.bookedAt||await suppressSavedQuoteReminderForBookedJourney(env.TRACKING_STORE,record))return response({error:'This journey has already been booked. It cannot be reopened or resent.'},409,origin);
 const action=String(body.action ?? '');
 if(!['reopen','resend','preview-return','offer-return'].includes(action))return response({error:'Choose reopen, resend or return offer.'},400,origin);
 let next=record;
 if(action==='preview-return'||action==='offer-return') {
  if(record.journey.returnJourney)return response({error:'This quote already includes a return journey.'},409,origin);
  const returnDate=String(body.returnDate ?? ''),returnTime=String(body.returnTime ?? '');
  if(Boolean(returnDate)!==Boolean(returnTime))return response({error:'Enter both return date and time, or leave both blank for the customer to choose.'},400,origin);
  const pickup=parseLondonLocalDateTime(record.journey.tripDate,record.journey.tripTime);
  const returning=parseLondonLocalDateTime(returnDate,returnTime);
  if(returnDate&&(!returning|| (pickup&&returning<=pickup)))return response({error:'Return date and time must be after pickup.'},400,origin);
  const journey={...record.journey,returnJourney:true,returnDate,returnTime};
  const priced=await buildAuthoritativeSavedQuotePricing({journey,pricing:await loadOwnerPricingOrDefault(env),googlePlacesApiKey:env.GOOGLE_PLACES_API_KEY});
  if(!priced.ok)return response({error:priced.message},422,origin);
  priced.pricing.pricingMeta={...priced.pricing.pricingMeta,ownerReturnOffer:true};
  if(action==='preview-return')return response({quote:view({...record,journey,pricing:priced.pricing},env)},200,origin);
  next=await createSavedQuote(env.TRACKING_STORE,{customerName:record.customerName,customerEmail:record.customerEmail,journey,pricing:priced.pricing});
 } else if(action==='reopen') {
  if(!isSavedQuoteExpired(record)&&record.status!=='expired')return response({error:'This quote is still open. Use resend instead.'},409,origin);
  const validityDays=Number(body.validityDays ?? 7);
  if(!Number.isInteger(validityDays)||validityDays<1||validityDays>30)return response({error:'Choose 1–30 days of validity.'},400,origin);
  // An old checkout must never be left payable beside a reopened quote.
  if(record.checkoutId) {
   const apiKey=env.SUMUP_API_KEY?.trim();if(!apiKey)return response({error:'Cannot verify the previous payment. SumUp is not configured.'},503,origin);
   try {
    const checkout=await getSumUpCheckout(apiKey,record.checkoutId);
    if(isSumUpCheckoutPaid(checkout))return response({error:'This checkout has already been paid. Refresh bookings.'},409,origin);
    if(checkout.status==='PENDING') {
     const retired=await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(record.checkoutId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${apiKey}`}});
     if(!retired.ok)return response({error:'Could not retire the previous payment link. Refresh bookings and try again.'},502,origin);
    }
   } catch {return response({error:'Could not verify the previous payment. Try again.'},502,origin);}
  }
  const now=new Date();next={...record,status:'saved',originalCreatedAt:record.originalCreatedAt || record.createdAt,reopenedAt:now.toISOString(),createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+validityDays*86400000).toISOString(),checkoutId:undefined,initialEmailSentAt:undefined,firstReminderSentAt:undefined,finalReminderSentAt:undefined,firstReminderClaimId:undefined,firstReminderClaimedAt:undefined,finalReminderClaimId:undefined,finalReminderClaimedAt:undefined,lastEmailError:undefined};
  await saveSavedQuoteRecord(env.TRACKING_STORE,next);
 } else if(isSavedQuoteExpired(record))return response({error:'Reopen this expired quote before resending.'},409,origin);
 const email=buildSavedQuoteInitialEmail(next,{origin:env.SITE_ORIGIN || 'https://www.myairporttaxini.co.uk'});
 const sent=await trySendBrandedCustomerEmail(env,{to:next.customerEmail,toName:next.customerName,subject:email.subject,body:email.text,htmlBody:email.html});
 next={...next,initialEmailSentAt:sent.sent?new Date().toISOString():next.initialEmailSentAt,lastEmailError:sent.sent?undefined:sent.error || 'Email was not accepted.'};
 await saveSavedQuoteRecord(env.TRACKING_STORE,next);
 return response({quote:view(next,env),emailSent:sent.sent,emailError:next.lastEmailError},200,origin);
}
