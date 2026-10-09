import type {CSSProperties} from 'react';
// TasteBridge's own drawing set: rounder strokes for a softer, social surface.
export type TbIconName='film'|'music'|'search'|'plus'|'close'|'chevron'|'check'|'eye'|'clock'|'alert'|'info'|'refresh'|'pen'|'userPlus'|'list'|'ticket';
const paths:Record<TbIconName,string>={
 film:'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
 music:'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 search:'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15M16 16l5 5',
 plus:'M12 5v14M5 12h14',
 close:'M6 6l12 12M18 6 6 18',
 chevron:'M9 5l7 7-7 7',
 check:'M5 12.5l4.2 4.2L19 7',
 eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
 clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 alert:'M12 9v4M12 17h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0',
 info:'M12 11v6M12 7.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
 pen:'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
 userPlus:'M15 20a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6',
 list:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
 ticket:'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM15 6v2M15 11v2M15 16v2',
};
export function TbIcon({name,size=18,className='',style}:{name:TbIconName;size?:number;className?:string;style?:CSSProperties}){
 return <svg aria-hidden="true" focusable="false" className={'tb-icon '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}><path d={paths[name]}/></svg>;
}
