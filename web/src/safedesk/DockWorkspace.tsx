import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {SdIcon,type SdIconName} from './icons';
import {defaultLayout,dockPanel,panelOrder,resizeSplit,validateLayout,type DockNode,type DockSide,type PanelId} from './dockModel';
const titles:Record<PanelId,string>={tasks:'Tasks',calendar:'Demo calendar',document:'Source document'};
const railLabels:Record<PanelId,string>={document:'Document',tasks:'Tasks',calendar:'Calendar'};
const icons:Record<PanelId,SdIconName>={tasks:'tasks',calendar:'calendar',document:'document'};
const storageKey='safedesk.workspace.v1';
type Region={x:number;y:number;w:number;h:number};
type Leaf=Region&{panel:PanelId};
type Split=Region&{id:string;axis:'horizontal'|'vertical';ratio:number};
function regions(node:DockNode,box:Region={x:0,y:0,w:100,h:100},leaves:Leaf[]=[],splits:Split[]=[]){
 if(node.type==='panel')leaves.push({...box,panel:node.panel});
 else{
 splits.push({...box,id:node.id,axis:node.axis,ratio:node.ratio});
 if(node.axis==='horizontal'){regions(node.first,{...box,w:box.w*node.ratio},leaves,splits);regions(node.second,{...box,x:box.x+box.w*node.ratio,w:box.w*(1-node.ratio)},leaves,splits)}
 else{regions(node.first,{...box,h:box.h*node.ratio},leaves,splits);regions(node.second,{...box,y:box.y+box.h*node.ratio,h:box.h*(1-node.ratio)},leaves,splits)}
 }
 return {leaves,splits};
}
function storedLayout(){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');return saved?.version===1?validateLayout(saved.layout):defaultLayout()}catch{return defaultLayout()}}
export function DockWorkspace({panels,focusRequest,lead,notes={}}:{panels:Record<PanelId,ReactNode>;focusRequest?:{panel:PanelId;request:number};lead?:ReactNode;notes?:Partial<Record<PanelId,ReactNode>>}){
 const [layout,setLayout]=useState<DockNode>(storedLayout),[dragging,setDragging]=useState<PanelId|null>(null),[maximized,setMaximized]=useState<PanelId|null>(null),[saved,setSaved]=useState(true);
 const [moving,setMoving]=useState<PanelId>('document'),[target,setTarget]=useState<PanelId>('tasks'),[side,setSide]=useState<DockSide>('left');
 const canvas=useRef<HTMLDivElement>(null),menu=useRef<HTMLDetailsElement>(null),activeResize=useRef<Split|null>(null);
 useEffect(()=>{
  const outside=(event:Event)=>{const element=menu.current;if(element?.open&&event.target instanceof Node&&!element.contains(event.target))element.open=false};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector<HTMLElement>('summary')?.focus()}};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('click',outside,true);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('click',outside,true);document.removeEventListener('keydown',escape)};
 },[]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify({version:1,layout}));setSaved(true)}catch{setSaved(false)}},[layout]);
 const {leaves,splits}=regions(layout);
 function move(source:PanelId,to:PanelId,edge:DockSide){setLayout(current=>dockPanel(current,source,to,edge));setDragging(null);setMaximized(null)}
 function focusPanel(panel:PanelId){setMaximized(null);requestAnimationFrame(()=>{const element=canvas.current?.querySelector<HTMLElement>('[data-panel="'+panel+'"]');element?.focus();element?.scrollIntoView?.({block:'nearest',behavior:'auto'})})}
 function openLayout(panel:PanelId){setMoving(panel);if(panel===target)setTarget(panelOrder(layout).find(p=>p!==panel)!);if(menu.current)menu.current.open=true;requestAnimationFrame(()=>menu.current?.querySelector<HTMLSelectElement>('select')?.focus())}
 useEffect(()=>{if(focusRequest)focusPanel(focusRequest.panel)},[focusRequest?.panel,focusRequest?.request]);
 return <div className="sd-dock">
 <div className="sd-toolbar">
  <div className="sd-toolbar-lead">{lead}</div>
  <div className="sd-layout-actions"><details className="sd-layout-menu" ref={menu}><summary><SdIcon name="layout" size={15}/>Layout</summary><div className="sd-layout-options">
   <p className="sd-layout-help">Drag a panel by its heading, or place it here. {saved?'Saved on this device.':'Kept in this tab only.'}</p>
   <label>Move panel<select aria-label="Panel to move" value={moving} onChange={e=>{const next=e.target.value as PanelId;setMoving(next);if(next===target)setTarget(panelOrder(layout).find(p=>p!==next)!)}}>{panelOrder(layout).map(p=><option value={p} key={p}>{titles[p]}</option>)}</select></label>
   <label>Beside<select aria-label="Target panel" value={target} onChange={e=>setTarget(e.target.value as PanelId)}>{panelOrder(layout).filter(p=>p!==moving).map(p=><option value={p} key={p}>{titles[p]}</option>)}</select></label>
   <label>Position<select aria-label="Dock position" value={side} onChange={e=>setSide(e.target.value as DockSide)}>{(['left','right','top','bottom'] as const).map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label>
   <button className="sd-btn sd-btn-primary" onClick={()=>{move(moving,target,side);if(menu.current)menu.current.open=false}}>Move panel</button>
  </div></details>
  <button className="sd-link" onClick={()=>{setLayout(defaultLayout());setMaximized(null)}}>Reset layout</button>{maximized&&<button className="sd-link" onClick={()=>setMaximized(null)}>Restore workspace</button>}</div>
 </div>
 <div className="sd-frame">
  <nav className="sd-rail" aria-label="Workspace modules">{(['document','tasks','calendar'] as const).map(panel=><button key={panel} className={maximized===panel?'is-active':''} onClick={()=>focusPanel(panel)} aria-label={'Focus '+titles[panel]}><SdIcon name={icons[panel]} size={20}/><span>{railLabels[panel]}</span></button>)}</nav>
  <div className={'sd-canvas'+(dragging?' is-dragging':'')} onDragEnd={()=>setDragging(null)}><div className="sd-canvas-inner" ref={canvas}>
  {leaves.map((leaf,i)=>{const panel=leaf.panel,full=maximized===panel;
  const style:CSSProperties=full?{left:0,top:0,width:'100%',height:'100%'}:{left:leaf.x+'%',top:leaf.y+'%',width:leaf.w+'%',height:leaf.h+'%',order:i};
  return <section className={'sd-panel'+(dragging===panel?' is-drag-source':'')} data-panel={panel} aria-label={titles[panel]+' module'} key={panel} tabIndex={-1} style={style} hidden={!!maximized&&!full}><div className="sd-sheet">
   <div className="sd-panel-head" draggable={!maximized} onDragStart={e=>{e.dataTransfer.setData('application/x-safedesk-panel',panel);e.dataTransfer.effectAllowed='move';setDragging(panel)}} onDragEnd={()=>setDragging(null)}>
    <button className="sd-grip" aria-label={'Drag '+titles[panel]+' panel'} title="Drag to rearrange, or click for layout options" onClick={()=>openLayout(panel)}><SdIcon name="grip" size={16}/></button>
    <SdIcon name={icons[panel]} size={16} className="sd-panel-icon"/><h2>{titles[panel]}</h2>{notes[panel]&&<span className="sd-panel-note">{notes[panel]}</span>}
    <button className="sd-icon-btn sd-panel-max" aria-label={(full?'Restore ':'Maximize ')+titles[panel]} title={full?'Restore':'Maximize'} onClick={()=>setMaximized(full?null:panel)}><SdIcon name="expand" size={14}/></button>
   </div>
   <div className="sd-panel-body">{panels[panel]}</div>
   {dragging&&dragging!==panel&&<div className="sd-drop-zones" aria-label={'Dock beside '+titles[panel]}>{(['left','right','top','bottom'] as const).map(edge=><div className={'sd-drop sd-drop-'+edge} data-edge={edge} key={edge} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}} onDrop={e=>{e.preventDefault();move(dragging,panel,edge)}}><span>{edge[0].toUpperCase()+edge.slice(1)}</span></div>)}</div>}
  </div></section>;
  })}
  {!maximized&&splits.map(split=>{const horizontal=split.axis==='horizontal';
  const style:CSSProperties=horizontal?{left:'calc('+(split.x+split.w*split.ratio)+'% - 4px)',top:split.y+'%',height:split.h+'%',width:8}:{top:'calc('+(split.y+split.h*split.ratio)+'% - 4px)',left:split.x+'%',width:split.w+'%',height:8};
  return <div className={'sd-splitter '+(horizontal?'sd-split-h':'sd-split-v')} style={style} role="separator" aria-label={'Resize '+panelOrder(layout).join(', ')+' split '+split.id} aria-orientation={horizontal?'vertical':'horizontal'} aria-valuemin={18} aria-valuemax={82} aria-valuenow={Math.round(split.ratio*100)} tabIndex={0} key={split.id}
  onPointerDown={e=>{e.preventDefault();activeResize.current=split;e.currentTarget.setPointerCapture?.(e.pointerId)}}
  onPointerMove={e=>{const active=activeResize.current,box=canvas.current?.getBoundingClientRect();if(!active||!box)return;const ratio=active.axis==='horizontal'?(e.clientX-box.left-box.width*active.x/100)/(box.width*active.w/100):(e.clientY-box.top-box.height*active.y/100)/(box.height*active.h/100);if(Number.isFinite(ratio))setLayout(current=>resizeSplit(current,active.id,ratio))}}
  onPointerUp={()=>{activeResize.current=null}} onPointerCancel={()=>{activeResize.current=null}}
  onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setLayout(current=>resizeSplit(current,split.id,split.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-.03:.03)))}}}><span/></div>;
  })}
  </div></div>
 </div>
 </div>;
}
