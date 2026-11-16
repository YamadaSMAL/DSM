import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMatrixData } from '../../src/domain';
import { AnalysisClient, AnalysisStopped } from '../../src/workers/analysisClient';
import type { AnalysisRequest, AnalysisResponse } from '../../src/workers/analysisProtocol';
import { provenance } from '../helpers';
class FakeWorker {
  static all: FakeWorker[]=[];
  onmessage: ((event:{data:AnalysisResponse})=>void)|null=null;
  onerror:(()=>void)|null=null;
  messages:AnalysisRequest[]=[];terminated=false;
  constructor(){FakeWorker.all.push(this);}
  postMessage(message:AnalysisRequest){this.messages.push(message);}
  terminate(){this.terminated=true;}
  send(data:AnalysisResponse){this.onmessage?.({data});}
}
const source=()=>createMatrixData([[0,0],[1,0]],{convention:'row-depends-on-column',provenance});
beforeEach(()=>{vi.stubGlobal('Worker',FakeWorker);FakeWorker.all=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('元バッファをコピーして転送し、古いrunとrevisionの応答を無視する',async()=>{
  const client=new AnalysisClient(), matrix=source(), callback=vi.fn();const promise=client.run(matrix,'scc-tarjan-kahn-v1',{}, {},callback), rejected=expect(promise).rejects.toThrow('取り消し');
  const worker=FakeWorker.all[0]!,request=worker.messages[0]!;
  expect(request.source.values).not.toBe(matrix.values);expect(matrix.values.byteLength).toBe(32);
  worker.send({runId:'old',dataRevision:1,status:'failed',error:'古い'});worker.send({runId:request.runId,dataRevision:99,status:'failed',error:'古い'});expect(callback).not.toHaveBeenCalled();
  client.dispose();await rejected;
});
it('協調取消はcancel応答を受け、Workerを次の実行に再利用する',async()=>{
  const client=new AnalysisClient();const promise=client.run(source(),'scc-tarjan-kahn-v1',{}, {},()=>{}), rejected=expect(promise).rejects.toMatchObject({status:'cancelled'});
  const worker=FakeWorker.all[0]!,request=worker.messages[0]!;client.cancel();expect(worker.messages[1]).toMatchObject({type:'cancel',runId:request.runId});worker.send({runId:request.runId,dataRevision:1,status:'cancelled',error:'取消'});await rejected;
  expect(worker.terminated).toBe(false);const next=client.run(source(),'scc-tarjan-kahn-v1',{}, {},()=>{}), nextRejected=expect(next).rejects.toBeInstanceOf(AnalysisStopped);expect(FakeWorker.all).toHaveLength(1);client.dispose();await nextRejected;
});
it('応答しないWorkerは取消1秒・実行上限30秒で停止し、新規生成できる',async()=>{
  vi.useFakeTimers();const client=new AnalysisClient();const first=client.run(source(),'scc-tarjan-kahn-v1',{}, {},()=>{}), rejected=expect(first).rejects.toMatchObject({status:'cancelled'});client.cancel();await vi.advanceTimersByTimeAsync(1000);await rejected;expect(FakeWorker.all[0]!.terminated).toBe(true);
  const second=client.run(source(),'scc-tarjan-kahn-v1',{}, {},()=>{}), timed=expect(second).rejects.toMatchObject({status:'limit-reached'});await vi.advanceTimersByTimeAsync(30_000);await timed;expect(FakeWorker.all[1]!.terminated).toBe(true);
});
it('異常終了を失敗として扱う',async()=>{
  const client=new AnalysisClient();const promise=client.run(source(),'scc-tarjan-kahn-v1',{}, {},()=>{}), rejected=expect(promise).rejects.toMatchObject({status:'failed'});FakeWorker.all[0]!.onerror!();await rejected;
});
