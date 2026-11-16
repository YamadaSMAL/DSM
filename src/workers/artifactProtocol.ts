import type { SessionData } from '../io/session';
export type ArtifactFormat='html'|'xlsx'|'json';
export type ArtifactRequest={runId:string;dataRevision:number}&({type:'load';bytes:ArrayBuffer}|{type:'export';format:ArtifactFormat;snapshot:SessionData});
export type ArtifactResponse={runId:string;dataRevision:number}&({status:'loaded';session:SessionData}|{status:'exported';bytes:ArrayBuffer;mime:string;filename:string}|{status:'failed';error:string});
