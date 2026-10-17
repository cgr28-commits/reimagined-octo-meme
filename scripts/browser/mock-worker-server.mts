/** Isolated HTTP adapter for the REAL Worker entry point. Never reads live env. */
import { createServer } from 'node:http';
import workerModule from '../../workers/addresses/src/index.ts';
import { mockKv, mockConsentNamespace } from '../measurement-test-helpers.ts';
type TestWorker = {fetch(request: Request, env: Record<string, unknown>): Promise<Response>};
const app = ((workerModule as unknown as {default?: TestWorker}).default ?? workerModule) as TestWorker;
const kv = mockKv();
type MockCheckout = {id:string;status:string;date:string;hosted_checkout_url:string;amount:number;currency:string;checkout_reference:string;description:string;redirect_url:string;transaction_id?:string;transaction_code?:string};
const checkouts = new Map<string, MockCheckout>();
const events: Array<{host:string;path:string;method:string}> = [], emails: unknown[] = [], blocked: string[] = [], duplicateStable: boolean[] = [];
const ephemeral = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const encoded = Buffer.from(await crypto.subtle.exportKey('pkcs8',ephemeral.privateKey)).toString('base64');
const serviceAccount = {client_email:'fictional@example.invalid',private_key:'-----BEGIN PRIVATE KEY-----\n'+encoded+'\n-----END PRIVATE KEY-----\n'};
const env = {
 TRACKING_STORE: kv, BOOKING_COUNTER: kv, CONSENT_LEDGER: await mockConsentNamespace(),
 GOOGLE_CALENDAR_ID: 'fictional-calendar', GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
 GOOGLE_PLACES_API_KEY: 'fictional-local-provider',
 SUMUP_API_KEY: 'fictional-local-provider', SUMUP_MERCHANT_CODE: 'fictional-local-merchant',
 QUOTE_RECEIPT_SECRET: 'fictional-local-quote-receipt-secret',
 GOOGLE_ADS_PAID_UPLOAD_VERIFIED: 'false',
 BOOKING_TO_EMAIL: 'owner@example.invalid', BOOKING_FROM_EMAIL: 'bookings@example.invalid',
 BOOKING_NOTIFICATION_EMAIL: 'owner@example.invalid', OWNER_EMAIL_COPY_ADDRESS: 'owner@example.invalid',
 EMAIL: {send: async (message: unknown) => {emails.push(message);return {messageId:'fictional-email'};}},
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
 const u = new URL(input instanceof Request?input.url:String(input));
 events.push({host:u.hostname,path:u.pathname,method:init?.method ?? 'GET'});
 if(u.hostname==='api.sumup.com') {
  if(init?.method==='POST' && u.pathname==='/v0.1/checkouts') {
   const body=JSON.parse(String(init.body)) as Pick<MockCheckout,'amount'|'currency'|'checkout_reference'|'description'|'redirect_url'>;const id='TEST-'+crypto.randomUUID();
   const c={...body,id,status:'PENDING',date:new Date().toISOString(),hosted_checkout_url:'https://checkout.sumup.com/'+id};checkouts.set(id,c);return json(c);
  }
  const c=checkouts.get(u.pathname.split('/').pop()!);return c?json(c):json({error:'Fictional checkout not found'},404);
 }
 if(u.hostname==='oauth2.googleapis.com')return json({access_token:'fictional-access',expires_in:3600});
 if(u.hostname==='www.googleapis.com' && u.pathname.startsWith('/calendar/'))return json(init?.method==='POST'?{id:'TEST-EVENT-'+crypto.randomUUID()}:{items:[]});
 if(u.hostname==='places.googleapis.com') return json({id:'TEST-HOME',location:{latitude:54.60,longitude:-5.93},places:[{location:{latitude:54.60,longitude:-5.93}}]});
 if(u.pathname.includes('/route/v1/')) return json({code:'Ok',routes:[{distance:20000,duration:1800,geometry:{coordinates:[]}}]});
 blocked.push(u.origin+u.pathname);throw Error('Unexpected external provider blocked: '+u.origin+u.pathname);
};
const server = createServer(async (req,res) => {
 try {
  const u=new URL(req.url!,'http://127.0.0.1:8789');
  if(u.pathname.startsWith('/__test/')) {
   res.setHeader('access-control-allow-origin','*');
   if(u.pathname==='/__test/pay') {
    const c=checkouts.get(u.searchParams.get('id')!);if(!c)throw Error('Unknown synthetic checkout');
    c.status='PAID';c.transaction_id='TEST-TRANSACTION-'+c.id;c.transaction_code='TEST-CODE';
    // Actual webhook route, twice: no browser return is needed to save the paid booking.
    let afterFirst=0;for(let i=0;i<2;i++){const response=await app.fetch(new Request('http://127.0.0.1:8789/payments/webhook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:c.id})}),env);if(response.status!==200)throw Error('Webhook failed');if(i===0)afterFirst=emails.length;else duplicateStable.push(emails.length===afterFirst);}
   }
   res.setHeader('content-type','application/json');res.end(JSON.stringify({events,emails:emails.length,blocked,duplicateStable,records:[...kv.m].filter(([k])=>k.startsWith('booking:ref:')).map(([,v])=>JSON.parse(v)),measurementKeys:[...kv.m.keys()].filter(k=>k.startsWith('measurement:')),checkouts:[...checkouts.values()]}));return;
  }
  const chunks: Buffer[]=[];for await(const b of req) chunks.push(b);
  const body=Buffer.concat(chunks);const headers=new Headers();for(const [k,v] of Object.entries(req.headers)) if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  const response=await app.fetch(new Request(u,{method:req.method,headers,...(body.length?{body}: {})}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
});
server.listen(8789,'127.0.0.1',()=>console.log('Mock-provider Worker HTTP adapter ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
