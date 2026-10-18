import assert from 'node:assert/strict';
import { activateTestBooking, readTestBookingPrefill, isTestBookingAllowed, TEST_BOOKING_STORAGE_KEY } from '../src/lib/test-booking';
const originalEnv = process.env.NODE_ENV;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const values = new Map<string,string>();
const storage = {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)};
function context(env:string,hostname:string) {
 Object.assign(process.env,{NODE_ENV:env});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{hostname}}});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});
 values.clear();
}
try {
 for(const env of ['production','development','test']) {
  for(const host of ['myairporttaxini.co.uk','www.myairporttaxini.co.uk','evil.localhost','localhost.evil.example','example.vercel.app','example.pages.dev','localhost','127.0.0.1','[::1]']) {
   context(env,host);
   const allowed=env!=='production'&&['localhost','127.0.0.1','[::1]'].includes(host);
   assert.equal(isTestBookingAllowed(),allowed);
   storage.setItem(TEST_BOOKING_STORAGE_KEY,JSON.stringify({active:true,chargeAmount:1,pickupAddress:'injected route'}));
   const prefill=readTestBookingPrefill();
   assert.equal(prefill!==null,allowed,`${env}/${host}`);
   assert.equal(storage.getItem(TEST_BOOKING_STORAGE_KEY),null);
   if(prefill) {assert.equal(prefill.chargeAmount,1);assert.notEqual(prefill.pickupAddress,'injected route');}
   assert.equal(activateTestBooking()!==null,allowed);
   assert.equal(readTestBookingPrefill()!==null,allowed);
   assert.equal(readTestBookingPrefill(),null,'one-shot activation');
  }
 }
 context('development','localhost');
 for(const raw of ['{','null','{"active":true,"chargeAmount":0}','{"active":true,"chargeAmount":999}','{"active":"true","chargeAmount":1}']) {
  storage.setItem(TEST_BOOKING_STORAGE_KEY,raw);assert.equal(readTestBookingPrefill(),null);
 }
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('storage disabled')}});
 assert.equal(activateTestBooking(),null);assert.equal(readTestBookingPrefill(),null);
 context('production','www.myairporttaxini.co.uk');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('storage disabled')}});
 assert.equal(activateTestBooking(),null);assert.equal(readTestBookingPrefill(),null);
 delete (globalThis as Record<string,unknown>).window;
 assert.equal(isTestBookingAllowed(),false);assert.equal(readTestBookingPrefill(),null);
 console.log('PASS: 27 environment/hostname combinations; forged production storage; activation; one-shot canonical local fixture; tampered amounts; malformed/unavailable storage; SSR.');
} finally {
 if(originalEnv===undefined) delete process.env.NODE_ENV; else Object.assign(process.env,{NODE_ENV:originalEnv});
 for(const [key,descriptor] of [['window',originalWindow],['sessionStorage',originalStorage]] as const) {
  if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as Record<string,unknown>)[key];
 }
}
