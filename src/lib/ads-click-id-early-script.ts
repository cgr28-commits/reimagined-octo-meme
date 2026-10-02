/**
 * Runs before React hydration. Same-site links in the first HTML do not include
 * the landing query, so a click before the React listener would drop gclid.
 * This only rewrites the href. It does not navigate, and it does not call Google.
 */
export const ADS_CLICK_ID_EARLY_SCRIPT = `(function(){try{
var CONSENT_KEY="matni-cookie-consent-v1";
var COOKIE_NAME="matni-ads-attribution-v1";
var KEYS=["gclid","gbraid","wbraid","utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
if(!window.__matniLandingSearch&&typeof window.location.search==="string"&&window.location.search.length>1){
window.__matniLandingSearch=window.location.search;
}
function consent(){
try{
var value=window.localStorage.getItem(CONSENT_KEY);
return value==="accepted"||value==="rejected"?value:null;
}catch(e){return null;}
}
function paramsFrom(search){
var raw=typeof search==="string"?search:"";
if(raw.charAt(0)==="?")raw=raw.slice(1);
return new URLSearchParams(raw);
}
function cookieAttribution(){
var all=typeof document.cookie==="string"?document.cookie:"";
var parts=all.split(";");
var prefix=COOKIE_NAME+"=";
for(var i=0;i<parts.length;i++){
var part=parts[i].replace(/^\\s+/,"");
if(part.indexOf(prefix)!==0)continue;
try{return JSON.parse(decodeURIComponent(part.slice(prefix.length)));}catch(e){return null;}
}
return null;
}
document.addEventListener("click",function(event){
if(!event||event.defaultPrevented)return;
var choice=consent();
if(choice==="rejected")return;
var target=event.target;
if(!target||typeof target.closest!=="function")return;
var anchor=target.closest("a");
if(!anchor||typeof anchor.getAttribute!=="function")return;
var href=anchor.getAttribute("href");
if(!href||href.charAt(0)==="#"||/^(?:mailto:|tel:|sms:)/i.test(href))return;
var url;
try{url=new URL(href,window.location.href);}catch(e){return;}
if(url.origin!==window.location.origin)return;
var landing=paramsFrom(window.__matniLandingSearch||"");
var current=paramsFrom(window.location.search||"");
var changed=false;
for(var k=0;k<KEYS.length;k++){
var key=KEYS[k];
var value=landing.get(key)||current.get(key)||"";
if(value&&!url.searchParams.has(key)){url.searchParams.set(key,value);changed=true;}
}
if(choice==="accepted"){
var stored=cookieAttribution();
if(stored&&typeof stored==="object"){
for(var j=0;j<KEYS.length;j++){
var key2=KEYS[j];
var storedValue=typeof stored[key2]==="string"?stored[key2]:"";
if(storedValue&&!url.searchParams.has(key2)){url.searchParams.set(key2,storedValue);changed=true;}
}
}
}
if(!changed||typeof anchor.setAttribute!=="function")return;
anchor.setAttribute("href",url.pathname+url.search+url.hash);
},true);
}catch(e){}})();`;
