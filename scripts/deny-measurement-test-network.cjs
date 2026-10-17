globalThis.fetch=async()=>{throw new Error('Unexpected network disabled for regression tests')};
for(const name of ['http','https']){const m=require(name);m.request=()=>{throw new Error('Unexpected network disabled for regression tests')};m.get=m.request;}
