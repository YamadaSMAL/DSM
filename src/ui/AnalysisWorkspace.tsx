import { useEffect, useMemo, useRef, useState } from 'react';
import { identityOrder, preprocess, type AnalysisMode, type MatrixData } from '../domain';
import { algorithms, comparisonKey, compareResults } from '../algorithms/registry';
import { defaultK } from '../algorithms/hierarchical';
import { processViewMetrics } from '../algorithms/process';
import type { RunResult } from '../algorithms/types';
import { initialView, type ViewHistory } from '../state/views';
import { AnalysisClient, AnalysisStopped } from '../workers/analysisClient';
import type { AnalysisResponse } from '../workers/analysisProtocol';
import { MatrixCanvas } from './MatrixCanvas';
import { OrderEditor } from './OrderEditor';
const metricLabels: Record<string, string> = {
  coordinationCost: '調整コスト', totalWeight: '総重み', internalWeight: '内部重み', externalWeight: '外部重み', externalRatio: '外部比', clusterCount: 'クラスタ数', minClusterSize: '最小規模', maxClusterSize: '最大規模', meanClusterSize: '平均規模', alpha: 'α',
  feedbackWeight: 'フィードバック重み', feedbackCount: 'フィードバック件数', feedbackRatio: 'フィードバック比', interSccFeedbackWeight: 'SCC間フィードバック重み', sccCount: 'SCC数', maxSccSize: '最大SCC規模', cyclicBlockCount: '循環ブロック数', bandCount: 'Band数',
};
function number(value: number | null | undefined) { return value === null || value === undefined ? '—（関係なし）' : value.toLocaleString('ja-JP', { maximumSignificantDigits: 8 }); }
export function AnalysisWorkspace({ matrix }: { matrix: MatrixData | null }) {
  const [mode, setMode] = useState<AnalysisMode>('structure');
  const [algorithm, setAlgorithm] = useState('hierarchical-average-v1');
  const [threshold, setThreshold] = useState('0'), [binary, setBinary] = useState(false);
  const [k, setK] = useState(String(defaultK(matrix?.n ?? 1))), [alpha, setAlpha] = useState('1');
  const [runs, setRuns] = useState<RunResult[]>([]), [selectedId, setSelectedId] = useState('');
  const [views, setViews] = useState<Record<string, ViewHistory>>({});
  const [colorOptions, setColorOptions] = useState({ log: false, alternative: false });
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Extract<AnalysisResponse, { status: 'progress' }>['progress'] | null>(null);
  const client = useRef<AnalysisClient | null>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; client.current?.dispose(); }, []);
  const selected = runs.find(r => r.runId === selectedId), history = selected ? views[selected.runId] : undefined;
  const plugin = algorithms.find(a => a.id === algorithm)!;
  const valid = matrix && threshold.trim() !== '' && Number.isFinite(Number(threshold)) && Number(threshold) >= 0 && (mode === 'process' || alpha.trim() !== '' && Number.isFinite(Number(alpha)) && Number(alpha) > 0 && Number(alpha) <= 3) && (algorithm !== 'hierarchical-average-v1' || k.trim() !== '' && Number.isInteger(Number(k)) && Number(k) >= 1 && Number(k) <= matrix.n);
  async function execute() {
    if (!matrix || !valid || busy) return;
    const token = ++generation.current;
    setBusy(true); setStatus('解析中'); setProgress(null); client.current ??= new AnalysisClient();
    try {
      const result = await client.current.run(matrix, algorithm, { k: Number(k), alpha: Number(alpha) }, { threshold: Number(threshold), binary }, response => { if (token === generation.current) setProgress(response.progress); });
      if (token !== generation.current) return;
      setRuns(previous => [...previous, result]); setSelectedId(result.runId); setViews(previous => ({ ...previous, [result.runId]: initialView(result.order) })); setStatus('completed · 解析完了');
    } catch (error) { if (token === generation.current) setStatus(`${error instanceof AnalysisStopped ? error.status : 'failed'} · ${error instanceof Error ? error.message : String(error)}`); }
    finally { if (token === generation.current) setBusy(false); }
  }
  const viewMetrics = useMemo(() => matrix && selected?.scc && history ? processViewMetrics(preprocess(matrix, selected.options).directed, history.order, selected.scc) : null, [matrix, selected, history]);
  const comparable = selected ? runs.filter(r => comparisonKey(r) === comparisonKey(selected)).sort(compareResults) : [];
  const changed = selected && (mode !== selected.mode || algorithm !== selected.algorithm.id || algorithm === 'hierarchical-average-v1' && Number(k) !== selected.parameters.k || Number(threshold) !== selected.options.threshold || binary !== selected.options.binary || selected.mode === 'structure' && Number(alpha) !== selected.parameters.alpha);
  const sharedMax = useMemo(() => matrix?.values.reduce((a,b) => Math.max(a,b), 0) ?? 0, [matrix]);
  return <section className="analysis-workspace" aria-label="解析ワークスペース">
    <section className="panel"><h2>03 · 解析条件</h2><div className="controls">
      <label><input type="radio" name="mode" checked={mode === 'structure'} onChange={() => { setMode('structure'); setAlgorithm('hierarchical-average-v1'); }} />構造 · 部品・組織のまとまり</label>
      <label><input type="radio" name="mode" checked={mode === 'process'} onChange={() => { setMode('process'); setAlgorithm('scc-tarjan-kahn-v1'); }} />工程 · タスクの依存と順序</label>
      <label>手法<select aria-label="解析手法" value={algorithm} onChange={e => setAlgorithm(e.target.value)}>{algorithms.filter(a => a.mode === mode).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      <label>解析閾値 τ<input aria-label="実行する解析閾値" type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} /></label>
      <label><input type="checkbox" checked={binary} onChange={e => setBinary(e.target.checked)} />解析を二値化（閾値の後）</label>
      {mode === 'structure' && <><label>α<input aria-label="調整コストのα" type="number" min="0.01" max="3" step="any" value={alpha} onChange={e => setAlpha(e.target.value)} /></label>{algorithm === 'hierarchical-average-v1' && <label>クラスタ数 k<input aria-label="クラスタ数 k" type="number" min="1" max={matrix?.n ?? 500} step="1" value={k} onChange={e => setK(e.target.value)} /></label>}</>}
    </div>
    <p>{mode === 'structure' ? 'S=(D+Dᵀ)/2の直接結合を平均連結で分割します。kは指定値であり、最適k・調整コストの大域最適は保証しません。全併合履歴はk変更時に再利用します。単純実装は最悪O(n³)です。' : '列 → 行の有向DからSCCを抽出し、縮約DAGの先行順に並べます。SCC内は元順のままで循環は残ります。Bandは同時実行を保証しません。'}</p>
    <p>{plugin.baseline ? '比較基準（最適化手法ではありません）' : plugin.label} · {plugin.id} / {plugin.version} · 上限{plugin.limits.maxN}要素 · 決定的手法（seed不要）</p>
    <div className="actions"><button className="primary" disabled={!valid || busy} onClick={() => void execute()}>解析を実行</button><button disabled={!busy} onClick={() => { setStatus('取消中…'); client.current?.cancel(); }}>解析を取消</button></div>
    {!matrix && <p>データを確定すると解析できます。</p>}{matrix && !valid && <p role="alert">閾値は非負有限数、αは0より大きく3以下、kは1〜{matrix.n}の整数を指定してください。</p>}
    <p role="status" data-testid="analysis-status">{status}</p>
    {busy && progress && <p>段階: {progress.phase} / 反復: {progress.iterations} / 評価: {progress.evaluations} / 経過: {progress.elapsedMs.toFixed(0)}ms / 最良値: —（探索手法ではありません）</p>}
    </section>
    {matrix && !selected && <MatrixCanvas matrix={matrix} options={{ threshold: Number.isFinite(Number(threshold)) && Number(threshold) >= 0 ? Number(threshold) : 0, binary }} />}
    {!!runs.length && <section className="panel"><h2>04 · 完了結果</h2><p>選択結果と同じ入力ハッシュ・モード・前処理・指標版・αの結果だけ順位を付けます。順位は同条件の結果内での評価です。</p>
      <div className="table-scroll"><table aria-label="解析結果一覧"><thead><tr><th>選択</th><th>手法 / 条件</th><th>状態 / 時間</th><th>目的値</th><th>同条件順位</th><th>操作</th></tr></thead><tbody>{runs.map((run, index) => <tr key={run.runId}><td><input type="radio" name="run" aria-label={`結果${index + 1}を選択`} checked={selectedId === run.runId} onChange={() => setSelectedId(run.runId)} /></td><td>{run.mode === 'structure' ? '構造' : '工程'} · {algorithms.find(a => a.id === run.algorithm.id)?.label}<br />τ={run.options.threshold} / 二値化={String(run.options.binary)} / {JSON.stringify(run.parameters)}</td><td>{run.status}<br />{run.elapsedMs.toFixed(1)}ms</td><td>{number(run.metrics[run.mode === 'structure' ? 'coordinationCost' : 'feedbackWeight'])}</td><td>{comparable.some(r => r.runId === run.runId) ? 1 + comparable.filter(r => compareResults(r, run) < 0).length : '比較対象外（条件差）'}</td><td><button aria-label={`結果${index + 1}を削除`} onClick={() => { setRuns(previous => previous.filter(r => r.runId !== run.runId)); setViews(previous => { const next = { ...previous }; delete next[run.runId]; return next; }); if (selectedId === run.runId) setSelectedId(runs.find(r => r.runId !== run.runId)?.runId ?? ''); }}>削除</button></td></tr>)}</tbody></table></div>
    </section>}
    {matrix && selected && history && <>
      <section className="panel" aria-label="選択結果の情報"><h2>選択結果 · {selected.mode === 'structure' ? '構造クラスタ' : 'SCC・工程順序'}</h2>
      {changed && <p className="warning" role="status">設定が変更されています。以下は保存済みの解析条件による結果です。新しい条件は再実行してください。</p>}
      <p>{selected.algorithm.id} / {selected.algorithm.version} · revision {selected.dataRevision} · {selected.stopReason}<br />τ={selected.options.threshold} / 二値化={String(selected.options.binary)} / {JSON.stringify(selected.parameters)}<br />反復={selected.iterations} / 評価={selected.evaluations} / 経過={selected.elapsedMs.toFixed(1)}ms</p><p className="hash">入力ハッシュ: {selected.inputHash}</p>
      {selected.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}
      <div className="metric-grid" aria-label="解析結果の指標">{Object.entries(selected.metrics).map(([key, value]) => <div key={key} data-metric={key}><span>{metricLabels[key] ?? key}</span><strong>{number(value)}</strong></div>)}</div>
      <p>指標版: {Object.values(selected.metricVersions).join(', ')} / {selected.cacheHit ? '併合履歴を再利用' : '新規計算'}</p>
      <details><summary>前処理履歴</summary><ul>{selected.preprocessing.map((t,i) => <li key={i}>{t.kind}: {t.affectedCells}セル / {JSON.stringify(t.params)}</li>)}</ul></details>
      {selected.hierarchy && <details><summary>併合履歴（樹形図データ）{selected.hierarchy.merges.length}件</summary><div className="table-scroll"><table><thead><tr><th>ノード</th><th>左</th><th>右</th><th>距離</th><th>規模</th></tr></thead><tbody>{selected.hierarchy.merges.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.left}</td><td>{m.right}</td><td>{m.distance}</td><td>{m.size}</td></tr>)}</tbody></table></div><p>葉のindexは0始まり、併合ノードはnから始まります。</p></details>}
      <OrderEditor matrix={matrix} history={history} analysisOrder={selected.order} onChange={view => setViews(previous => ({ ...previous, [selected.runId]: view }))} />
      <p data-testid="view-order">現在の表示順: {history.order.map(i => matrix.elements[i]!.label).join(' → ')}</p>
      {viewMetrics && <div aria-label="現在のビュー指標"><p>現在のビュー: フィードバック重み {number(viewMetrics.feedbackWeight)} / 件数 {viewMetrics.feedbackCount} / 比 {number(viewMetrics.feedbackRatio)} / SCC間 {number(viewMetrics.interSccFeedbackWeight)}</p><p className={viewMetrics.orderGuaranteed ? '' : 'warning'}>{viewMetrics.orderGuaranteed ? 'SCCブロックの先行順を維持しています。' : 'SCC間順序またはブロックの連続性が崩れています。現在のビューには元のBandと順序保証を適用しません。'}</p></div>}
      </section>
      <div className="comparison-canvases"><MatrixCanvas matrix={matrix} order={identityOrder(matrix.n)} options={selected.options} title="元DSM · 入力順" sharedMax={sharedMax} colorOptions={colorOptions} onColorChange={setColorOptions} />
      <MatrixCanvas key={selected.runId} matrix={matrix} order={history.order} options={selected.options} title="結果DSM · 現在のビュー" initialAnalysis analysisKind={selected.mode === 'structure' ? 'symmetric' : 'directed'} sharedMax={sharedMax} colorOptions={colorOptions} onColorChange={setColorOptions} {...(selected.membership ? { membership: selected.membership, membershipKind: '構造クラスタ' as const } : selected.scc ? { membership: selected.scc.membership, membershipKind: 'SCC' as const, ...(viewMetrics?.orderGuaranteed ? { bands: selected.scc.bandByElement } : {}) } : {})} /></div>
      <section className="panel table-scroll"><table aria-label="所属と表示順位"><caption>所属は元indexで保持し、表示順とは区別します。</caption><thead><tr><th>ID / ラベル</th><th>元順位</th><th>表示順位</th><th>{selected.mode === 'structure' ? '構造クラスタ' : 'SCC'}</th>{selected.scc && <th>Band{!viewMetrics?.orderGuaranteed && '（元解析・現在ビューに非適用）'}</th>}</tr></thead><tbody>{matrix.elements.map(e => <tr key={e.id}><th>{e.id} / {e.label}</th><td>{e.originalIndex + 1}</td><td>{history.order.indexOf(e.originalIndex) + 1}</td><td>{(selected.membership ?? selected.scc!.membership)[e.originalIndex]! + 1}</td>{selected.scc && <td>{selected.scc.bandByElement[e.originalIndex]}</td>}</tr>)}</tbody></table></section>
    </>}
  </section>;
}
