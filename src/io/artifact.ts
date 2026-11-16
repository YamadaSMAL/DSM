import type { ArtifactMetadata } from './session';
export function artifactMetadata(): ArtifactMetadata { return { createdAt:new Date().toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,appVersion:typeof __APP_VERSION__==='undefined'?'test':__APP_VERSION__,appCommit:typeof __APP_COMMIT__==='undefined'?'test':__APP_COMMIT__,userAgent:typeof navigator==='undefined'?'Node':navigator.userAgent }; }
export function outputFilename(sourceName:string, extension:string, metadata:ArtifactMetadata):string {
  const safe=sourceName.replace(/\.[^.]+$/,'').normalize('NFC').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,60)||'matrix';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:metadata.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(metadata.createdAt));
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  return `dsm_${safe}_${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}.${extension}`;
}
