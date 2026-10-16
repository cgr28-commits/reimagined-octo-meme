// Isolated historical-code harness. No production access, keys, payments or messages.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),readline=require('node:readline');
if(process.argv[2]==='--child'){
 const root=process.argv[3];console.log=console.info=console.warn=console.error=(...v)=>process.stderr.write(v.join(' ')+'\n');
 const worker=require(path.join(root,'workers/addresses/src/index.ts')).default;
 const {calculateQuote}=require(path.join(root,'src/lib/quote.ts'));
 const {toPublicOwnerPricingConfig}=require(path.join(root,'shared/owner-pricing-config.ts'));
 const {composeWebsiteFareBreakdown}=require(path.join(root,'shared/website-fare-breakdown.ts'));
 const {quoteAirportAccessCharges}=require(path.join(root,'shared/meet-greet.ts'));
 const {resolveExpressDropOff}=require(path.join(root,'shared/express-drop-off.ts'));
 const data=new Map(),amounts=[];
 const store={async get(k,t){const v=data.get(k);return v==null?null:t==='json'?JSON.parse(v):v},async put(k,v){data.set(k,v)},async delete(k){data.delete(k)},async list(){return{keys:[],list_complete:true}}};
 const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:'test-owner',DRIVER_ACCESS_KEY:'test-driver',GOOGLE_PLACES_API_KEY:'test-google',SUMUP_API_KEY:'test-only',SUMUP_MERCHANT_CODE:'test-only',PUBLIC_SITE_ORIGIN:'https://www.myairporttaxini.co.uk'};
 globalThis.fetch=async(input,init)=>{
  const u=String(input);
  if(u.includes('maps.googleapis.com')||u.includes('places.googleapis.com'))return new Response(JSON.stringify({status:'OK',result:{geometry:{location:{lat:54.5964,lng:-5.9302}}},results:[{geometry:{location:{lat:54.5964,lng:-5.9302}}}],location:{latitude:54.5964,longitude:-5.9302}}),{headers:{'Content-Type':'application/json'}});
  if(u.includes('/route/v1/'))return new Response(JSON.stringify({code:'Ok',routes:[{distance:159000,duration:6720}]}),{headers:{'Content-Type':'application/json'}});
  if(u==='https://api.sumup.com/v0.1/checkouts'&&init?.method==='POST'){const b=JSON.parse(String(init.body));amounts.push(b.amount);return new Response(JSON.stringify({id:'legacy-test-'+amounts.length,checkout_reference:b.checkout_reference,hosted_checkout_url:'https://checkout.sumup.com/test-only',status:'PENDING',amount:b.amount}),{status:201})}
  if(u.includes('api.mailchannels.net/')||u.includes('api.resend.com/emails'))return new Response(JSON.stringify({id:'isolated-message'}));
  throw new Error('Unexpected external request blocked: '+u);
 };
 const lines=readline.createInterface({input:process.stdin});let pending=Promise.resolve();
 lines.on('line',line=>{pending=pending.then(async()=>{const m=JSON.parse(line);try{
  let result;
  if(m.kind==='init'){data.clear();data.set('owner:pricing-settings',JSON.stringify(m.settings));if(m.ownerKey)env.OWNER_ACCESS_KEY=m.ownerKey;result={ok:true};}
  else if(m.kind==='frontend'){
   const q=calculateQuote(m.address,m.airport,m.vehicle,!!m.returnJourney,{}, {distanceKm:159,durationMinutes:112},!!m.fromAirport,m.pricing);
   const access=quoteAirportAccessCharges({expressLegs:resolveExpressDropOff({airportCode:m.airport,fromAirport:!!m.fromAirport,returnJourney:!!m.returnJourney,selected:true}).legs,airportCode:m.airport,fromAirport:!!m.fromAirport,returnJourney:!!m.returnJourney});
   result={quote:q,final:composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:q.journeyFareGbp,airportFixedCostsGbp:q.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:!!m.returnJourney}).finalAmountPayableGbp};
  }else if(m.kind==='public'){result=toPublicOwnerPricingConfig(m.settings);}
  else {const response=await worker.fetch(new Request('https://worker.example'+m.path,{method:m.method||'GET',headers:{'Content-Type':'application/json',Origin:'https://www.myairporttaxini.co.uk',...(m.headers||{})},...(m.body?{body:JSON.stringify(m.body)}:{})}),env);result={status:response.status,body:await response.json(),checkoutAmounts:amounts.slice()};}
  process.stdout.write(JSON.stringify({id:m.id,result})+'\n');
 }catch(e){process.stdout.write(JSON.stringify({id:m.id,error:String(e.stack||e)})+'\n')}})});
}else{
 exports.stopTestProcess=async function(child){
  if(!child)return;
  await new Promise((resolve,reject)=>{
   // Wait for close, not just exit: Next's child server can still hold pipes/cache files.
   if(child.exitCode!==null||child.signalCode!==null)return resolve();
   const timer=setTimeout(()=>reject(new Error('Test process did not shut down; refusing to remove its working directory')),10000);
   child.once('close',()=>{clearTimeout(timer);resolve()});child.kill();
  });
 };
 exports.startLegacyHarness=async function(root){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matni-postcode-legacy-'));
  const archive=cp.execFileSync('git',['archive','--format=tar','6fd400514e3f4b9920142c24018434ad306188a3','src','shared','workers/addresses/src','workers/addresses/shared','workers/addresses/tsconfig.json','tsconfig.json','next.config.ts','package.json','postcss.config.mjs'],{cwd:root,maxBuffer:40*1024*1024});
  cp.execFileSync('tar',['-xf','-','-C',dir],{input:archive});
  fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
  fs.symlinkSync(path.join(root,'workers/addresses/node_modules'),path.join(dir,'workers/addresses/node_modules'),'dir');
  const child=cp.spawn(process.execPath,['--import',path.join(root,'node_modules/tsx/dist/loader.mjs'),__filename,'--child',dir],{cwd:dir,env:{...process.env,TSX_TSCONFIG_PATH:path.join(dir,'tsconfig.json')},stdio:['pipe','pipe','pipe']});
  let id=0,logs='';const waiting=new Map();child.stderr.on('data',b=>logs+=b);
  readline.createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),w=waiting.get(r.id);if(w){waiting.delete(r.id);r.error?w.reject(new Error(r.error)):w.resolve(r.result)}});
  child.on('exit',()=>{for(const w of waiting.values())w.reject(new Error('Legacy harness exited: '+logs.slice(-2000)));waiting.clear()});
  return{root:dir,call(message){return new Promise((resolve,reject)=>{const n=++id;waiting.set(n,{resolve,reject});child.stdin.write(JSON.stringify({...message,id:n})+'\n')})},async close(){child.stdin.end();await exports.stopTestProcess(child);await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})}};
 };
}
