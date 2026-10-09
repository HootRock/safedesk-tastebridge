export type Source={document_id:string;paragraph_id:string;quote:string};
export type Task={task_id:string;title:string;source:Source;start_at:string|null;end_at:string|null};
export type RunEvent={seq:number;kind:string;tool_name:string|null;decision:string|null;source:Source|null;payload:Record<string,unknown>;mode:string};
export type SafeRun={run_id:string;state:string;mode:string;error_code:string|null;document:{paragraphs:{paragraph_id:string;text:string}[]};draft:{version:number;items:Task[];clarifications:string[]}|null;preview:{preview_id:string;version:number;events:{title:string;start_at:string;end_at:string}[]}|null;events:RunEvent[];counters:Record<string,number>};
export type Entity={entity_id:string;name:string;kind:'movie'|'artist';year:number|null};
export type MovieRun={run_id:string;status:string;group_version:number;mode:string;error_code?:string|null;fetched_at?:string|null;candidates:{entity_id:string;name:string;metadata:Record<string,unknown>;ranking:{score:number;ranks:Record<string,number|null>}}[];explanations:string[];events:RunEvent[]};
