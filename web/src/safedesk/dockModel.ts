export type PanelId='tasks'|'calendar'|'document';
export type DockSide='left'|'right'|'top'|'bottom';
export type DockNode={type:'panel';panel:PanelId}|{type:'split';id:string;axis:'horizontal'|'vertical';ratio:number;first:DockNode;second:DockNode};
export function defaultLayout():DockNode{return {type:'split',id:'main',axis:'horizontal',ratio:.36,first:{type:'panel',panel:'tasks'},second:{type:'split',id:'right',axis:'horizontal',ratio:.58,first:{type:'panel',panel:'calendar'},second:{type:'panel',panel:'document'}}}}
export function panelOrder(node:DockNode):PanelId[]{return node.type==='panel'?[node.panel]:[...panelOrder(node.first),...panelOrder(node.second)]}
export function validateLayout(raw:unknown):DockNode{
 const ids=new Set<string>();
 function valid(value:unknown,depth:number):value is DockNode{
 if(!value||typeof value!=='object'||depth>6)return false;
 const n=value as DockNode;
 if(n.type==='panel')return ['tasks','calendar','document'].includes(n.panel);
 if(n.type!=='split'||typeof n.id!=='string'||ids.has(n.id)||!['horizontal','vertical'].includes(n.axis)||!Number.isFinite(n.ratio)||n.ratio<.18||n.ratio>.82)return false;
 ids.add(n.id);return valid(n.first,depth+1)&&valid(n.second,depth+1);
 }
 if(!valid(raw,0))return defaultLayout();
 const order=panelOrder(raw);return order.length===3&&new Set(order).size===3?raw:defaultLayout();
}
export function resizeSplit(node:DockNode,id:string,ratio:number):DockNode{
 if(node.type==='panel')return node;
 if(node.id===id)return {...node,ratio:Math.min(.82,Math.max(.18,ratio))};
 return {...node,first:resizeSplit(node.first,id,ratio),second:resizeSplit(node.second,id,ratio)};
}
export function dockPanel(node:DockNode,source:PanelId,target:PanelId,side:DockSide):DockNode{
 if(source===target)return node;
 function remove(n:DockNode):DockNode|null{
 if(n.type==='panel')return n.panel===source?null:n;
 const first=remove(n.first),second=remove(n.second);return !first?second:!second?first:{...n,first,second};
 }
 function insert(n:DockNode):DockNode{
 if(n.type==='panel'&&n.panel===target){
 const panel:DockNode={type:'panel',panel:source},before=side==='left'||side==='top';
 return {type:'split',id:'split-'+crypto.randomUUID(),axis:side==='left'||side==='right'?'horizontal':'vertical',ratio:.5,first:before?panel:n,second:before?n:panel};
 }
 return n.type==='panel'?n:{...n,first:insert(n.first),second:insert(n.second)};
 }
 const trimmed=remove(node);return trimmed?validateLayout(insert(trimmed)):node;
}

