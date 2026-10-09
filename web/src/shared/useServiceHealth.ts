import {useEffect,useLayoutEffect,useState} from 'react';
export type ServiceHealth={state:'connecting'}|{state:'unavailable'}|{state:'ready';mode:string;modelProvider:'codex'|'groq';publicHosting:boolean;modelEnabled:boolean;qlooConfigured:boolean};
// Plumbing only: each product words and styles its own status.
export function useServiceHealth(){
 const [health,setHealth]=useState<ServiceHealth>({state:'connecting'});
 useEffect(()=>{
  let active=true;
  fetch('/api/health').then(r=>{if(!r.ok)throw new Error();return r.json()}).then(s=>{if(active)setHealth({state:'ready',mode:String(s.mode),modelProvider:s.model==='groq'?'groq':'codex',publicHosting:s.public_hosting===true,modelEnabled:!!s.model_enabled,qlooConfigured:s.qloo_configured!==false})}).catch(()=>{if(active)setHealth({state:'unavailable'})});
  return()=>{active=false};
 },[]);
 return health;
}
// Each product sets its own tab identity before the first paint.
export function useDocumentIdentity(title:string,themeColor:string,favicon:string,product:string){
 useLayoutEffect(()=>{
  document.title=title;document.documentElement.dataset.product=product;
  let meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
  meta.content=themeColor;
  let icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon)}
  icon.href=favicon;
 },[title,themeColor,favicon,product]);
}
