import { sizeDistribution } from '../algorithms/diagnostics';
import type { RunResult } from '../algorithms/types';
/** Static, printable diagnostics; values come from replay-validated results. */
export function diagnosticsHtml(run:RunResult):string {
 const h=run.history,merges=run.hierarchy?.merges;
 const points=h?.points.map(p=>({x:h.metric==='matrixDifference'?p.iteration:p.evaluations,value:p.value,best:p.best}))??merges?.map((m,i)=>({x:i+1,value:m.distance,best:undefined}))??[];
 const label=h?.metric??(merges?'階層法の結合距離':''),xLabel=h?.metric==='matrixDifference'?'反復数':merges?'併合回数':'目的関数の評価回数';
 let chart='';
 if(points.length){
  const values=points.flatMap(p=>p.best===undefined?[p.value]:[p.value,p.best]),lo=Math.min(...values),hi=Math.max(...values),first=points[0]!.x,last=points.at(-1)!.x;
  const x=(n:number)=>65+(last===first?0:(n-first)/(last-first))*790,y=(n:number)=>225-(hi===lo?.5:(n-lo)/(hi-lo))*195;
  const line=(best:boolean)=>points.map(p=>`${x(p.x)},${y(best?p.best??p.value:p.value)}`).join(' ');
  chart=`<p>${label} / 青: ${h?.series==='candidate'?'評価候補':h?.series==='difference'?'行列変化量':merges?'結合距離':'現在解'} / 橙: 過去最良値（存在する場合）</p><svg viewBox="0 0 900 280" style="width:100%;max-width:1000px" role="img" aria-label="探索経過グラフ"><path d="M65 25V225H855" fill="none" stroke="currentColor"/><text x="65" y="20">${hi}</text><text x="0" y="230">${lo}</text><polyline points="${line(false)}" fill="none" stroke="#2268b5" stroke-width="2"/>${points[0]!.best!==undefined?`<polyline points="${line(true)}" fill="none" stroke="#aa4d00" stroke-width="2.5"/>`:''}<circle cx="${x(first)}" cy="${y(points[0]!.value)}" r="3" fill="#2268b5"/><text x="65" y="250">${first}</text><text x="810" y="250">${last}</text><text x="400" y="274">${xLabel}</text></svg><details><summary>探索履歴の数値</summary><div class="scroll"><table><thead><tr><th>${xLabel}</th><th>値</th><th>最良値</th></tr></thead><tbody>${points.map(p=>`<tr><td>${p.x}</td><td>${p.value}</td><td>${p.best??'—'}</td></tr>`).join('')}</tbody></table></div></details>`;
 }
 const distribution=run.membership?`<h3>クラスタ規模分布</h3><table><tr><th>要素数 / クラスタ</th><th>クラスタ数</th></tr>${sizeDistribution(run.membership).map(d=>`<tr><td>${d.size}</td><td>${d.clusters}</td></tr>`).join('')}</table>`:'';
 return `<section><h2>探索とクラスタの診断</h2><p>実行終了やコストの停滞は大域最適性・クラスタの妥当性を保証しません。外部依存比率は全要素を一群にまとめても0になります。</p>${chart||'<p>途中履歴はありません。</p>'}${h?`<p>${h.samples}観測から${h.points.length}点を保存、間隔${h.stride}観測、初回・最終を保持。間引きで途中の変動・極値を省く場合があります。MCLは行列変化量1e-6未満が5回で収束。評価候補は集団平均ではありません。</p>`:''}${merges?'<p>全併合履歴であり、コスト最小化の曲線ではありません。分割には先頭n−k回を使います。</p>':''}${distribution}</section>`;
}
