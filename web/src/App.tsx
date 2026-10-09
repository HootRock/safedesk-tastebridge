import {useState,useEffect} from 'react';
import {SafeDeskApp} from './safedesk/SafeDeskApp';
import {TasteBridgeApp} from './tastebridge/TasteBridgeApp';
// Two independent products share one local server; the path decides which one runs.
const currentPage=()=>location.pathname.includes('tastebridge')?'tastebridge':'safedesk';
export function App(){
 const [page,setPage]=useState(currentPage);
 useEffect(()=>{const restore=()=>setPage(currentPage());window.addEventListener('popstate',restore);return ()=>window.removeEventListener('popstate',restore)},[]);
 return page==='tastebridge'?<TasteBridgeApp/>:<SafeDeskApp/>;
}
