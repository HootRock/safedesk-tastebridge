import type {CSSProperties} from 'react';
// SafeDesk's own drawing set: fine pen strokes, square-ish terminals.
export type SdIconName='check'|'chevron'|'close'|'plus'|'calendar'|'document'|'tasks'|'grip'|'layout'|'expand'|'lock'|'source'|'clock'|'shield'|'shieldCheck'|'pen'|'alert'|'info'|'refresh';
const paths:Record<SdIconName,string>={
 check:'M5 12.5l4.2 4.2L19 7',
 chevron:'M9 5l7 7-7 7',
 close:'M6 6l12 12M18 6 6 18',
 plus:'M12 5v14M5 12h14',
 calendar:'M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2',
 document:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
 tasks:'M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2 2.3-2.2M4 18l1.2 1.2 2.3-2.2',
 grip:'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
 layout:'M4 5h16v14H4zM10 5v14M10 12h10',
 expand:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
 lock:'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
 source:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
 clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 shield:'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
 shieldCheck:'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
 pen:'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
 alert:'M12 9v4M12 17h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0',
 info:'M12 11v6M12 7.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};
export function SdIcon({name,size=18,className='',style}:{name:SdIconName;size?:number;className?:string;style?:CSSProperties}){
 return <svg aria-hidden="true" focusable="false" className={'sd-icon '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==='grip'?2.8:1.5} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={paths[name]}/></svg>;
}
