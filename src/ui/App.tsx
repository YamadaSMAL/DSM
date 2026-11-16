import { useEffect, useRef, useState } from 'react';
import type { MatrixData } from '../domain';
import { defaultOptions, type ImportOptions, type ImportPreview } from '../io/types';
import { ImportClient } from '../workers/client';
import { ArtifactClient } from '../workers/artifactClient';
import { rebaseSession, sessionInputHash, type SessionData } from '../io/session';
import { AnalysisWorkspace } from './AnalysisWorkspace';
const sample = ',A,B,C\nA,0,0,0\nB,1,0,0\nC,0,1,0\n';
export function App() {
  const [options, setOptions] = useState<ImportOptions>({ ...defaultOptions });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingSession,setPendingSession]=useState<SessionData|null>(null),[restored,setRestored]=useState<SessionData|null>(null);
  const artifactClient=useRef<ArtifactClient|null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [active, setActive] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const client = useRef<ImportClient | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  useEffect(() => () => {client.current?.cancel();artifactClient.current?.cancel();}, []);
  function invalidate() { generation.current++; client.current?.cancel(); artifactClient.current?.cancel(); setPendingSession(null); setPreview(null); setBusy(false); setMessage(''); }
  function update<K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) { invalidate(); setOptions(o => ({ ...o, [key]: value })); }
  function choose(next: File) { invalidate(); setFile(next); setSheets([]); setOptions(o => ({ ...o, sheet: '', range: '', reorderColumns: false })); }
  async function inspect() {
    if (!file) return;
    invalidate();
    const token = generation.current;
    setBusy(true);
    client.current ??= new ImportClient();
    try {
      let result: ImportPreview;
      if(/\.json$/i.test(file.name)) {
        artifactClient.current??=new ArtifactClient();
        const loaded=await artifactClient.current.load(file,revision.current+1);
        if(token!==generation.current)return;
        const session=rebaseSession(loaded,revision.current+1);setPendingSession(session);
        result={sourceName:session.input.provenance.sourceName,source:session.source,sheets:[],issues:[],issueCount:0,warnings:[`セッション: ${session.runs.length}結果とビューを検証しました。元ファイルのバイト列は復元しません。`],columnProposal:[],matrix:session.input,inputHash:await sessionInputHash(session),elapsedMs:0};
      } else result=await client.current.run(file, { ...options }, revision.current + 1);
      if (token !== generation.current) return;
      setSheets(result.sheets);
      setPreview(result);
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function cancel() { invalidate(); setMessage('取込を取り消しました。確定済みデータは保持しています。'); }
  function commit() {
    if (!preview?.matrix || preview.issueCount) return;
    revision.current = preview.matrix.revision; setRestored(pendingSession); setPendingSession(null); setActive(preview); setPreview(null); setMessage('プレビューを確定しました。');
  }
  const check = (key: 'labels' | 'symbols' | 'blanks' | 'diagonalBlanks' | 'cachedFormula' | 'reorderColumns', label: string) => <label><input type="checkbox" checked={options[key]} onChange={e => update(key, e.target.checked)} />{label}</label>;
  const matrix: MatrixData | null = active?.matrix ?? null;
  return <main>
    <header><a className="brand" href="#main">DSM <span>解析</span></a><span className="badge">v0.1 · 解析・保存版</span></header>
    <section id="main" className="intro"><p className="eyebrow">構造と工程を、同じ行列から。</p><h1>依存を読み込み、<br />つながりを確かめる。</h1><p>CSV / XLSXをブラウザ内で検証・表示します。入力データは送信せず、この画面のメモリで保持します。</p></section>
    <section className="panel" aria-labelledby="import-title" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const next = e.dataTransfer.files[0]; if (next) choose(next); }}>
      <h2 id="import-title">01 · ファイルを確認</h2><p>ファイルをここへドロップ、または選択してください。上限20MiB・500要素。対応: CSV / TSV / .xlsx / セッション.json（64MiBまで）（.xls・.xlsm・暗号化ブックは非対応）</p>
      <div className="controls"><label>入力ファイル<input type="file" accept=".csv,.tsv,.xlsx,.json" onChange={e => { const next = e.target.files?.[0]; if (next) choose(next); }} /></label><button onClick={() => choose(new File([sample], 'sample-chain.csv', { type: 'text/csv' }))}>サンプル A → B → C</button></div>
      {/\.json$/i.test(file?.name??'') && <p>セッションJSONでは保存済み条件を復元します。以下のCSV/XLSX取込設定は使いません。</p>}
      {file && <p>選択: {file.name}（{file.size.toLocaleString()} bytes）</p>}
      <div className="controls">{check('labels', '先頭行・列がラベル')}
        <label>入力方向<select aria-label="入力方向" value={options.convention} onChange={e => update('convention', e.target.value as ImportOptions['convention'])}><option value="row-depends-on-column">行が列に依存</option><option value="row-supplies-column">行から列へ供給（転置）</option></select></label>
        <label>CSV文字コード<select aria-label="CSV文字コード" value={options.encoding} onChange={e => update('encoding', e.target.value as ImportOptions['encoding'])}><option value="utf-8">UTF-8（既定）</option><option value="shift_jis">Shift_JIS（明示指定）</option></select></label>
        <label>CSV区切り<select aria-label="CSV区切り" value={options.delimiter} onChange={e => update('delimiter', e.target.value as ImportOptions['delimiter'])}><option value="">推定</option><option value=",">カンマ</option><option value={'\t'}>タブ</option><option value=";">セミコロン</option></select></label>
      </div>
      <p className="direction-preview">方向プレビュー: {options.convention === 'row-depends-on-column' ? '行B・列Aの1は「BがAに依存」、A → B。' : '行B・列Aの1は「BからAへ供給」、B → A。取込時に転置します。'} 内部は常に「行が列に依存」です。</p>
      {/\.xlsx$/i.test(file?.name ?? '') && <div className="controls"><label>シート名<input list="sheets" value={options.sheet} placeholder="空欄は最初のシート" onChange={e => update('sheet', e.target.value)} /><datalist id="sheets">{sheets.map(s => <option key={s} value={s} />)}</datalist></label><label>A1範囲<input value={options.range} placeholder="例 A1:D4（空欄は使用範囲）" onChange={e => update('range', e.target.value)} /></label></div>}
      <details><summary>値変換と詳細設定（既定では変換しません）</summary><div className="controls">{check('symbols', '記号 X / x / × を1へ変換')}{check('blanks', '空セル=0')}{check('diagonalBlanks', '対角の空セル・「-」=0')}{check('cachedFormula', '保存済み計算値を利用（古い可能性・再計算なし）')}{check('reorderColumns', '列照合案を適用')}</div></details>
      <div className="actions"><button className="primary" disabled={!file || busy} onClick={() => void inspect()}>検証してプレビュー</button><button disabled={!busy && !preview} onClick={cancel}>取込を取消</button>{busy && <span role="status">Workerで取込・検証中…（20秒上限）</span>}</div>
      {message && <p role="status">{message}</p>}
    </section>
    {preview && <section className="panel preview" aria-labelledby="preview-title"><h2 id="preview-title">02 · プレビューを確認</h2><p>{preview.sourceName} / シート: {preview.source.sheet ?? 'CSV'} / 範囲: {preview.source.range ?? '全体'} / {preview.elapsedMs.toFixed(1)}ms</p>
      <p>元セル表（先頭8行・8列、変換前）</p><div className="table-scroll"><table aria-label="元セルプレビュー"><tbody>{preview.source.rows.slice(0, 8).map((row, i) => <tr key={i}>{row.slice(0, 8).map((cell, j) => <td key={j}>{cell.formula !== undefined ? `=${cell.formula}（保存値: ${cell.value ?? 'なし'}）` : String(cell.value ?? '')}</td>)}</tr>)}</tbody></table></div>
      {!!preview.columnProposal.length && <aside className="note"><strong>列照合案（適用には詳細設定の選択と再検証が必要）</strong><p>{preview.columnProposal.join(' / ')}</p></aside>}
      {preview.issueCount > 0 && <div role="alert"><h3>エラー {preview.issueCount}件（先頭100件まで）</h3><ul>{preview.issues.map((issue, i) => <li key={i}><strong>{preview.sourceName} / {preview.source.sheet ?? 'CSV'} / {issue.cell}</strong>: 「{issue.original}」 {issue.reason} 修正: {issue.fix}</li>)}</ul></div>}
      {preview.warnings.map((warning, i) => <p className="warning" key={i}>注意: {warning}</p>)}
      {preview.matrix && <><p>正規化後: {preview.matrix.n} × {preview.matrix.n} / 行が列に依存（列 → 行）</p><div className="table-scroll"><table aria-label="正規化プレビュー"><tbody>{preview.matrix.elements.slice(0, 8).map((e, i) => <tr key={e.id}><th>{e.label} / {e.id}</th>{Array.from({ length: Math.min(8, preview.matrix!.n) }, (_, j) => <td key={j}>{preview.matrix!.values[i * preview.matrix!.n + j]}</td>)}</tr>)}</tbody></table></div><h3>変換履歴</h3>{preview.matrix.provenance.transformations.length ? <ul>{preview.matrix.provenance.transformations.map((t, i) => <li key={i}>{t.kind}: {t.affectedCells}セル / {JSON.stringify(t.params)}</li>)}</ul> : <p>変換なし</p>}<p className="hash">原ファイル SHA-256: {preview.matrix.provenance.sourceSha256}<br />解析入力 SHA-256: {preview.inputHash}</p></>}
      <div className="actions"><button className="primary" disabled={!preview.matrix || preview.issueCount > 0} onClick={commit}>このデータを確定</button><button onClick={cancel}>プレビューを取消</button></div>
    </section>}
    {matrix && <p role="status">確定済み: {matrix.provenance.sourceName} / revision {matrix.revision} / {matrix.n}要素</p>}
    <AnalysisWorkspace key={matrix?.revision ?? 0} matrix={matrix} {...(active ? {source:active.source} : {})} restored={restored} />
    <footer>読み方: BがAに依存するなら行B・列Aが1、グラフはA → B。原データを変更せず、解析用行列を別に作ります。</footer>
  </main>;
}
