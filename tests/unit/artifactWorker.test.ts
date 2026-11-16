import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ArtifactClient} from '../../src/workers/artifactClient';
import type {ArtifactRequest,ArtifactResponse} from '../../src/workers/artifactProtocol';
import type {SessionData} from '../../src/io/session';
class FakeWorker{
  static all:FakeWorker[]=[];messages:ArtifactRequest[]=[];transfers:Transferable[][]=[];terminated=false;
  onmessage:((e:{data:ArtifactResponse})=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(){FakeWorker.all.push(this);}
  postMessage(message:ArtifactRequest,transfers:Transferable[]){this.messages.push(message);this.transfers.push(transfers);}
  terminate(){this.terminated=true;}
}
const snapshot=()=>({input:{revision:2,values:new Float64Array([0])}} as unknown as SessionData);
beforeEach(()=>{vi.stubGlobal('Worker',FakeWorker);FakeWorker.all=[];});afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('古い応答を拒否し、元行列バッファを転送しない',async()=>{const client=new ArtifactClient(),data=snapshot(),promise=client.export(data,'html');const worker=FakeWorker.all[0]!,request=worker.messages[0]!;expect(worker.transfers[0]).toEqual([]);worker.onmessage!({data:{runId:'old',dataRevision:2,status:'failed',error:'old'}});worker.onmessage!({data:{runId:request.runId,dataRevision:3,status:'failed',error:'old'}});worker.onmessage!({data:{runId:request.runId,dataRevision:2,status:'exported',bytes:new ArrayBuffer(1),filename:'x.html',mime:'text/html'}});await expect(promise).resolves.toMatchObject({filename:'x.html'});expect(data.input.values.byteLength).toBe(8);expect(worker.terminated).toBe(true);});
it('取消と30秒上限・異常終了でWorkerを解放する',async()=>{vi.useFakeTimers();const client=new ArtifactClient(),a=client.export(snapshot(),'json'),rejected=expect(a).rejects.toThrow('取り消し');client.cancel();await rejected;expect(FakeWorker.all[0]!.terminated).toBe(true);const b=client.export(snapshot(),'json'),timed=expect(b).rejects.toThrow('30秒');await vi.advanceTimersByTimeAsync(30_000);await timed;const c=client.export(snapshot(),'json'),failed=expect(c).rejects.toThrow('異常終了');FakeWorker.all[2]!.onerror!();await failed;});
it('旧ファイルの遅い読込が新しい出力を取り消さない',async()=>{const client=new ArtifactClient(),file=new File(['{}'],'x.json');let resolveRead:(bytes:ArrayBuffer)=>void=()=>{};vi.spyOn(file,'arrayBuffer').mockImplementation(()=>new Promise(resolve=>{resolveRead=resolve;}));const old=client.load(file,1),cancelled=expect(old).rejects.toThrow('取り消し');client.cancel();const next=client.export(snapshot(),'json'),nextCancelled=expect(next).rejects.toThrow('取り消し');resolveRead(new ArrayBuffer(0));await cancelled;expect(FakeWorker.all).toHaveLength(1);expect(FakeWorker.all[0]!.terminated).toBe(false);client.cancel();await nextCancelled;});
