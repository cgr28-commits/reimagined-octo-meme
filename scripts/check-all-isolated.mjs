/** Run every TS regression without credentials, live network or subprocess side effects. */
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const files=process.env.MATNI_REGRESSION_SELECTION?JSON.parse(fs.readFileSync(process.env.MATNI_REGRESSION_SELECTION,'utf8')).filter(f=>fs.existsSync('scripts/'+f)):fs.readdirSync('scripts').filter(f=>/^check-.*\.tsx?$/.test(f)).sort();
const results=[];let index=0;
async function worker(){while(index<files.length){const file=files[index++];
 const result=await new Promise(resolve=>{
  const child=spawn(process.execPath,['--require','./scripts/deny-measurement-test-network.cjs','--import','tsx','scripts/'+file],{env:{PATH:process.env.PATH,NODE_OPTIONS:'--require '+process.cwd()+'/scripts/deny-regression-subprocess.cjs'},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;if(output.length>20000)output=output.slice(-20000)});
  const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
  child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({file,code,signal,output:code===0?'':output})});
 });results.push(result);console.log(result.code===0?'PASS':'FAIL',file);
}}
await Promise.all(Array.from({length:4},worker));
fs.writeFileSync(process.env.MATNI_REGRESSION_RESULTS||'/tmp/matni-all-regressions.json',JSON.stringify(results,null,2));
const passed=results.filter(r=>r.code===0).length;console.log(`${passed}/${results.length} passed`);process.exitCode=passed===results.length?0:1;
