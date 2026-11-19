import { Tip } from './Tip';
import { useState } from 'react';
import type { RunResult } from '../algorithms/types';
import { comparisonKey, isRankable, objectiveValue } from '../algorithms/registry';
import { adjustedRand, sizeDistribution } from '../algorithms/diagnostics';
const format=(n:number)=>n.toLocaleString('ja-JP',{maximumSignificantDigits:6});
const names:Record<string,string>={totalCost:'TotalCost',mdl:'MDL',coordinationCost:'調整コスト C_coord',feedbackWeight:'フィードバック重み',matrixDifference:'確率行列の最大変化量'};
const reasons:Record<string,string>={'itc-exhausted':'要素試行リストを消化','generation-budget':'指定世代数を実行','proposal-budget':'提案数の上限','evaluation-budget':'評価数の上限','time-limit':'時間上限','cancelled':'取消','converged':'行列の収束条件を達成','iteration-limit':'反復数の上限','temperature-floor':'温度下限','trivial':'要素数などにより探索不要'};
interface Point {x:number;value:number;best?:number}
function Curve({points,label,xLabel,series,threshold}:{points:Point[];label:string;xLabel:string;series:string;threshold?:number}){
 const [index,setIndex]=useState(0),[log,setLog]=useState(false);
 if(!points.length)return <p>途中履歴はありません。</p>;
 const chosen=points[Math.min(index,points.length-1)]!;
 const values=points.flatMap(p=>p.best===undefined?[p.value]:[p.value,p.best]);if(threshold!==undefined)values.push(threshold);
 const positive=values.every(v=>v>0),useLog=log&&positive,transform=(v:number)=>useLog?Math.log10(v):v;
 const lo=Math.min(...values.map(transform)),hi=Math.max(...values.map(transform)),minX=points[0]!.x,maxX=points.at(-1)!.x;
 const x=(n:number)=>65+(maxX===minX?0:(n-minX)/(maxX-minX))*790;
 const y=(v:number)=>225-(hi===lo?.5:(transform(v)-lo)/(hi-lo))*195;
 const path=(best:boolean)=>points.map(p=>`${x(p.x)},${y(best?p.best??p.value:p.value)}`).join(' ');
 return <div className="diagnostic-chart">
  <div className="chart-head"><p className="legend"><span className="swatch blue" aria-hidden="true" />{label} · 青: {series}{points[0]!.best!==undefined?<><span className="swatch orange" aria-hidden="true" />{' / 橙: 過去最良値（低いほどよい）'}</>:''}</p>
  <label className="check"><input type="checkbox" checked={log&&positive} disabled={!positive} onChange={e=>setLog(e.target.checked)}/>縦軸を対数表示</label>{!positive&&<span className="muted">（0以下を含むため線形表示）</span>}</div>
  <svg preserveAspectRatio="none" viewBox="0 0 900 280" role="img" aria-label={`${label}の推移`} onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect(),target=minX+Math.max(0,Math.min(1,((e.clientX-box.left)/box.width*900-65)/790))*(maxX-minX);let closest=0;points.forEach((p,i)=>{if(Math.abs(p.x-target)<Math.abs(points[closest]!.x-target))closest=i;});setIndex(closest);}}>
   <path d="M65 25V225H855" fill="none" stroke="currentColor"/>
   <text x="60" y="20">{format(useLog?10**hi:hi)}</text><text x="0" y="230">{format(useLog?10**lo:lo)}</text>
   {threshold!==undefined&&<><path d={`M65 ${y(threshold)}H855`} stroke="#65716c" strokeDasharray="6 4"/><text x="600" y={Math.max(16,y(threshold)-5)}>収束閾値 {format(threshold)}</text></>}
   <polyline points={path(false)} fill="none" stroke="#2268b5" strokeWidth="2"/>
   {points[0]!.best!==undefined&&<polyline points={path(true)} fill="none" stroke="#aa4d00" strokeWidth="2.5"/>}
   <circle cx={x(chosen.x)} cy={y(chosen.value)} r="4" fill="#2268b5"/>
   <text x="65" y="250">{format(minX)}</text><text x="810" y="250">{format(maxX)}</text><text x="400" y="274">{xLabel}</text>
  </svg>
  <p className="chart-axis-summary">{xLabel}: {format(minX)}〜{format(maxX)} / 縦軸: {format(useLog?10**lo:lo)}〜{format(useLog?10**hi:hi)}{useLog?'（対数）':''}</p>
  <label className="field inline-field">履歴の位置<input aria-label="履歴の位置" type="range" min="0" max={points.length-1} value={Math.min(index,points.length-1)} onChange={e=>setIndex(Number(e.target.value))}/></label>
  <p aria-live="polite" className="meta">{xLabel}: {format(chosen.x)} / {series}: {format(chosen.value)}{chosen.best!==undefined?` / 最良値: ${format(chosen.best)}`:''}</p>
  <details className="disclosure small"><summary>グラフの数値データ</summary><div className="table-scroll"><table><thead><tr><th scope="col">{xLabel}</th><th scope="col">{series}</th>{points[0]!.best!==undefined&&<th scope="col">最良値</th>}</tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{p.x}</td><td>{p.value}</td>{p.best!==undefined&&<td>{p.best}</td>}</tr>)}</tbody></table></div></details>
 </div>;
}
export function SearchDiagnostics({run,runs}:{run:RunResult;runs:RunResult[]}){
 const h=run.history,distribution=run.membership?sizeDistribution(run.membership):[];
 const peers=run.membership&&isRankable(run)?runs.filter(r=>r.runId!==run.runId&&r.membership&&r.seed!==undefined&&r.seed!==run.seed&&r.algorithm.id===run.algorithm.id&&isRankable(r)&&comparisonKey(r)===comparisonKey(run)):[];
 return <section aria-label="探索とクラスタの診断" className="search-diagnostics"><h3>探索とクラスタの診断 <Tip text="解析がどのように進み、どう終わったかを確認する欄です。曲線が早く平らになっていれば探索が落ち着いたことを示しますが、最適解であることの保証にはなりません。" /></h3>
  <p className="meta">終了理由: {reasons[run.stopReason]??run.stopReason}（{run.status}）。{run.converged===true?'MCLの行列変化量が規定条件を満たしました。':'実行終了や曲線の停滞は、大域最適性やクラスタの妥当性を保証しません。'}</p>
  {h?<><Curve points={h.points.map(p=>({x:h.metric==='matrixDifference'?p.iteration:p.evaluations,value:p.value,...(p.best!==undefined?{best:p.best}:{})}))} label={names[h.metric]!} xLabel={h.metric==='matrixDifference'?'反復数':'目的関数の評価回数'} series={h.series==='current'?'現在解':h.series==='candidate'?'評価候補':'行列変化量'} {...(h.metric==='matrixDifference'?{threshold:1e-6}:{})}/>
   <p className="muted small-text">{h.samples}観測から{h.points.length}点を表示（記録間隔 {h.stride}観測、初回・最終を保持）。間引きにより途中の変動や極値を省く場合があります。{h.series==='candidate'?'評価候補には初期集団と合法化後の子を含み、集団平均ではありません。':''}{h.metric==='matrixDifference'?'1e-6未満が5回続くことがMCLの収束条件です。':''}</p></>:run.hierarchy?<><Curve points={run.hierarchy.merges.map((m,i)=>({x:i+1,value:m.distance}))} label="階層法の結合距離" xLabel="併合回数" series="結合距離"/><p className="muted small-text">全併合の履歴です。選択したクラスタ数kの分割には先頭n−k回の併合を使います。コストの最小化曲線ではありません。</p></>:<p>この結果には途中履歴がありません。以前のセッションの探索履歴を見るには再実行してください。比較基準やSCC法はコスト収束を判定しません。</p>}
  {!!distribution.length&&<><h4>クラスタ規模分布 <Tip text="何要素のクラスタがいくつあるかの分布です。解析時の所属で集計します。全要素を一群にすると外部比は0になるため、規模分布と併せて評価してください。" /></h4><p className="meta">外部依存比率: {run.metrics['externalRatio']===null?'—（関係なし）':format(run.metrics['externalRatio']!)}</p><div className="table-scroll"><table aria-label="クラスタ規模分布"><thead><tr><th scope="col">要素数 / クラスタ</th><th scope="col">クラスタ数</th><th scope="col">分布</th></tr></thead><tbody>{distribution.map(d=><tr key={d.size}><td>{d.size}</td><td>{d.clusters}</td><td><meter min="0" max={Math.max(...distribution.map(x=>x.clusters))} value={d.clusters} aria-label={`${d.size}要素のクラスタ数`}/></td></tr>)}</tbody></table></div></>}
  {run.membership&&<><h4>seed間の所属の安定性 <Tip text="異なるseed（乱数の種）で解析したとき、同じようなクラスタに分かれるかを示します。ARI（調整Rand指数）は1で完全一致、0付近は偶然程度、負値もあります。同じ手法・入力・評価条件の通常終了結果と比較します。安定していても良い分割とは限りません。" /></h4>{peers.length?<div className="table-scroll"><table aria-label="seed間の所属安定性"><thead><tr><th scope="col">比較seed</th><th scope="col">目的値</th><th scope="col">ARI（選択結果との比較）</th></tr></thead><tbody>{peers.map(peer=><tr key={peer.runId}><td>{peer.seed}</td><td>{format(objectiveValue(peer))}</td><td>{format(adjustedRand(run.membership!,peer.membership!))}</td></tr>)}</tbody></table></div>:<p className="muted">比較対象がありません。異なるseedの通常終了結果を追加してください。暫定・未収束の結果は比較対象から除外します。</p>}</>}
 </section>;
}
