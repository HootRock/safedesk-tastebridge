let actionToken:string|null=null;
let connection:Promise<void>|null=null;
async function connect(){
  if(!connection)connection=fetch('/api/session').then(async r=>{if(!r.ok)throw new Error('Session unavailable');actionToken=(await r.json()).action_token}).finally(()=>{connection=null});
  await connection;
}
export async function requestJson<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!path.startsWith('/api/'))throw new Error('Invalid request');
  if(!actionToken)await connect();
  const r=await fetch(path,{...init,headers:{'Content-Type':'application/json',...(init.method && init.method!=='GET'?{'X-Action-Token':actionToken!}:{}),...init.headers}});
  const data=await r.json();
  if(!r.ok){if(r.status===401)actionToken=null;throw new Error(typeof data.detail==='string'?data.detail:'Please check the input and try again.');}
  return data;
}
export const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
