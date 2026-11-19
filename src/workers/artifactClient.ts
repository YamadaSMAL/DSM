import { SESSION_LIMIT, type SessionData } from '../io/session';
import type { ArtifactFormat, ArtifactRequest, ArtifactResponse } from './artifactProtocol';
/** 保存・出力・読込では全結果を再計算して検証する。結果数に比例して時間がかかるため、全体の上限ではなく「進捗が止まった時間」で打ち切る。 */
export const ARTIFACT_IDLE_LIMIT_MS=60_000;
export type ArtifactProgress=(done:number,total:number)=>void;
export class ArtifactClient {
  private generation=0;
  private worker:Worker|null=null;
  private stop:((reason:Error)=>void)|null=null;
  cancel(){this.generation++;this.stop?.(new Error('入出力を取り消しました。確定済みデータは保持しています。'));}
  private request(payload:Omit<Extract<ArtifactRequest,{type:'export'}>,'runId'>|Omit<Extract<ArtifactRequest,{type:'load'}>,'runId'>,onProgress?:ArtifactProgress):Promise<Exclude<ArtifactResponse,{status:'progress'}>>{
    this.cancel();const worker=new Worker(new URL('./artifact.worker.ts',import.meta.url),{type:'module'}),runId=crypto.randomUUID();this.worker=worker;
    return new Promise((resolve,reject)=>{
      let timer:ReturnType<typeof setTimeout>;
      const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{finish();reject(new Error(`入出力が${ARTIFACT_IDLE_LIMIT_MS/1000}秒間進まなかったため中止しました。結果件数やデータを小さくしてください。`));},ARTIFACT_IDLE_LIMIT_MS);};
      const finish=()=>{clearTimeout(timer);worker.terminate();if(this.worker===worker){this.worker=null;this.stop=null;}};
      arm();
      this.stop=reason=>{finish();reject(reason);};
      worker.onmessage=({data}:MessageEvent<ArtifactResponse>)=>{if(this.worker!==worker||data.runId!==runId||data.dataRevision!==payload.dataRevision)return;if(data.status==='progress'){arm();onProgress?.(data.done,data.total);return;}finish();if(data.status==='failed')reject(new Error(data.error));else resolve(data);};
      worker.onerror=()=>{finish();reject(new Error('入出力Workerが異常終了しました。確定済みデータは保持しています。'));};
      try{const request={...payload,runId};worker.postMessage(request,request.type==='load'?[request.bytes]:[]);}catch(error){finish();reject(error);}
    });
  }
  async load(file:File,revision:number,onProgress?:ArtifactProgress):Promise<SessionData>{this.cancel();const generation=this.generation;if(file.size>SESSION_LIMIT)throw new Error('セッションJSONは64MiB以内にしてください。');const bytes=await file.arrayBuffer();if(generation!==this.generation)throw new Error('セッション読込を取り消しました。');const response=await this.request({type:'load',bytes,dataRevision:revision},onProgress);if(response.status!=='loaded')throw new Error('応答形式が不正です。');return response.session;}
  async export(snapshot:SessionData,format:ArtifactFormat,onProgress?:ArtifactProgress){const response=await this.request({type:'export',snapshot,format,dataRevision:snapshot.input.revision},onProgress);if(response.status!=='exported')throw new Error('応答形式が不正です。');return response;}
}
