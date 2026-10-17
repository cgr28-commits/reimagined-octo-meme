/* eslint-disable @typescript-eslint/no-require-imports -- Node synchronous --require preload; ESM would run after test imports. */
// Only the local TypeScript transform service may spawn; never live CLI tools.
const child=require('node:child_process');
const path=require('node:path');
for(const key of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']){
 const original=child[key].bind(child);
 child[key]=(...args)=>{
  if(['execFile','execFileSync','spawn','spawnSync'].includes(key)&&typeof args[0]==='string'&&path.basename(args[0])==='esbuild'&&Array.isArray(args[1])&&args[1].some(a=>a==='--version'||a.startsWith('--service=')))return original(...args);
  throw Error('External subprocess disabled for isolated regressions');
 };
}
require('node:module').syncBuiltinESMExports();
