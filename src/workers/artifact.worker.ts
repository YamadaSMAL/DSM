import { parseSession, serializeSession, validateSession } from '../io/session';
import { prepareExport } from '../io/prepareExport';
import { htmlExport } from '../io/htmlExport';
import { xlsxExport } from '../io/xlsxExport';
import { outputFilename } from '../io/artifact';
import type { ArtifactRequest, ArtifactResponse } from './artifactProtocol';
const scope=self as unknown as {onmessage:((event:MessageEvent<ArtifactRequest>)=>void)|null;postMessage(message:ArtifactResponse,transfer?:Transferable[]):void};
scope.onmessage=async({data})=>{
  const {runId,dataRevision}=data;
  try {
    if(data.type==='load') {scope.postMessage({runId,dataRevision,status:'loaded',session:await parseSession(data.bytes)});return;}
    let bytes:ArrayBuffer,mime:string;
    if(data.format==='json'){const session=await validateSession(data.snapshot);bytes=new TextEncoder().encode(serializeSession(session)).buffer;mime='application/json';}
    else {const prepared=await prepareExport(data.snapshot);if(data.format==='html'){bytes=new TextEncoder().encode(htmlExport(prepared)).buffer;mime='text/html';}else{bytes=xlsxExport(prepared);mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}}
    scope.postMessage({runId,dataRevision,status:'exported',bytes,mime,filename:outputFilename(data.snapshot.input.provenance.sourceName,data.format,data.snapshot.metadata)},[bytes]);
  }catch(error){scope.postMessage({runId,dataRevision,status:'failed',error:error instanceof Error?error.message:String(error)});}
};
