import { isIgtaProfile } from '../algorithms/igtaProfile';
import { permuteMatrix, preprocess } from '../domain';
import { batchStatistics } from '../algorithms/statistics';
import { comparisonKey, isRankable } from '../algorithms/registry';
import { processViewMetrics } from '../algorithms/process';
import { validateSession, type SessionData } from './session';
export async function prepareExport(snapshot: SessionData) {
  const session=await validateSession(snapshot), selected=session.runs.find(r=>r.runId===session.selectedRunId);
  if(!selected)throw new Error('HTML/XLSX出力は完了結果を選択してください。');
  const order=session.views[selected.runId]!.order, matrices=preprocess(session.input,selected.options);
  const analysis=selected.mode==='structure'&&!isIgtaProfile(selected.algorithm.id)?matrices.symmetric:matrices.directed;
  const view=selected.scc?processViewMetrics(matrices.directed,order,selected.scc):null;
  let currentMetrics: Record<string,number|null> = selected.metrics;
  if(view) { const {version:_version,orderGuaranteed:_guaranteed,...metrics}=view; currentMetrics=metrics; }
  return {session,selected,order,analysis,batches:batchStatistics(session.runs),reordered:permuteMatrix(analysis,order),currentMetrics,orderGuaranteed:view?.orderGuaranteed??true,comparisons:session.runs.map(run=>({run,comparable:isRankable(run)&&comparisonKey(run)===comparisonKey(selected)}))};
}
export type PreparedExport=Awaited<ReturnType<typeof prepareExport>>;
