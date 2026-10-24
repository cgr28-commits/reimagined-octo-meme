// Only booleans are passed to this step, never secret values.
const names=['CLOUDFLARE_API_TOKEN','SUMUP_API_KEY','SUMUP_MERCHANT_CODE','GOOGLE_PLACES_API_KEY','OWNER_ACCESS_KEY','QUOTE_RECEIPT_SECRET'];
let missing=false;
for(const name of names){const present=process.env[`HAS_${name}`]==='true';console.log(`${present?'PRESENT':'MISSING'} PR692_STAGING_${name}`);missing||=!present;}
const origin=process.env.HAS_FRONTEND_ORIGIN==='true';
console.log(`${origin?'PRESENT':'MISSING'} variable PR692_STAGING_FRONTEND_ORIGIN`);missing||=!origin;
if(missing){console.error('BLOCKED: configure the dedicated pr692-staging environment. No credentials used, deployment or payments attempted.');process.exit(1);}
const response=await fetch('https://api.github.com/repos/cgr28-commits/reimagined-octo-meme/environments/pr692-staging',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GITHUB_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Cannot verify staging environment protection; refusing deployment');
const environment=await response.json();
if(!environment.protection_rules?.some(rule=>rule.type==='required_reviewers'&&rule.reviewers?.length>0))throw Error('Configure required reviewers for pr692-staging before deployment');
console.log('Protected staging environment verified');
