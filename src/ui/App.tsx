import { useEffect, useRef, useState } from 'react';
import type { MatrixData } from '../domain';
import { defaultOptions, type ImportOptions, type ImportPreview } from '../io/types';
import { ImportClient } from '../workers/client';
import { ArtifactClient } from '../workers/artifactClient';
import { rebaseSession, sessionInputHash, type SessionData } from '../io/session';
import { AnalysisWorkspace } from './AnalysisWorkspace';
import { StepTitle, Tip } from './Tip';
export type TabId = 'data' | 'analysis' | 'results' | 'export';
const tabs: { id: TabId; label: string; tip: string }[] = [
  { id: 'data', label: 'データ', tip: 'ファイルを読み込み、内容を確認して確定します。' },
  { id: 'analysis', label: '解析', tip: '解析の種類・手法・条件を選んで実行します。' },
  { id: 'results', label: '結果', tip: '解析結果の一覧・指標・並び替えたDSMを確認します。' },
  { id: 'export', label: '出力', tip: 'レポート（HTML / XLSX）や作業状態（JSON）を保存します。' },
];
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
  const [tab, setTab] = useState<TabId>('data'), [resultCount, setResultCount] = useState(0), [progressText, setProgressText] = useState('');
  const client = useRef<ImportClient | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  useEffect(() => () => {client.current?.cancel();artifactClient.current?.cancel();}, []);
  function invalidate() { setProgressText(''); generation.current++; client.current?.cancel(); artifactClient.current?.cancel(); setPendingSession(null); setPreview(null); setBusy(false); setMessage(''); }
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
        const loaded=await artifactClient.current.load(file,revision.current+1,(done,total)=>{if(token===generation.current&&total)setProgressText(`保存済み結果を再計算して検証中 ${done}/${total}`);});
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
    revision.current = preview.matrix.revision; setRestored(pendingSession); setPendingSession(null); setActive(preview); setPreview(null); setMessage('プレビューを確定しました。'); setTab(pendingSession?.runs.length ? 'results' : 'analysis');
  }
  const check = (key: 'labels' | 'symbols' | 'blanks' | 'diagonalBlanks' | 'cachedFormula' | 'reorderColumns', label: string, tip?: string) => <span className="with-tip"><label className="check"><input type="checkbox" checked={options[key]} onChange={e => update(key, e.target.checked)} />{label}</label>{tip && <Tip text={tip} />}</span>;
  const matrix: MatrixData | null = active?.matrix ?? null;
  const isSession = /\.json$/i.test(file?.name ?? '');
  const enabled = (id: TabId) => id === 'data' || !!matrix && (id !== 'results' || resultCount > 0);
  return <>
    <header className="topbar"><div className="topbar-inner">
      <a className="brand" href="#main"><span className="brand-mark" aria-hidden="true" />DSM <span>解析</span></a>
      <nav className="tabs" role="tablist" aria-label="作業ステップ">{tabs.map((t, i) => <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={tab === t.id} title={t.tip} className={tab === t.id ? 'tab active' : 'tab'} disabled={!enabled(t.id)} onClick={() => setTab(t.id)}><span className="tab-no" aria-hidden="true">{i + 1}</span>{t.label}{t.id === 'results' && resultCount > 0 && <span className="tab-count" aria-hidden="true">{resultCount}</span>}</button>)}</nav>
      <div className="topbar-right">
        {matrix && <p role="status" className="data-chip" title={matrix.provenance.sourceName}><span className="dot" aria-hidden="true" />確定済み: {matrix.provenance.sourceName} / revision {matrix.revision} / {matrix.n}要素</p>}
        <span className="badge">v0.4<Tip label="バージョンの説明" text="v0.4 · 原典参照プロファイル。論文由来の IGTA+ / G-IGTA 手法を含む版です。" /></span>
      </div>
    </div></header>
    <main id="main">
    <div role="tabpanel" id="panel-data" aria-labelledby="tab-data" hidden={tab !== 'data'}>
    <h1 className="sr-only">DSM解析</h1>
    <section className="panel" aria-labelledby="import-title" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const next = e.dataTransfer.files[0]; if (next) choose(next); }}>
      <StepTitle no="01" id="import-title" tip={<>ファイルを画面へドロップするか、選択してください。<br />対応形式: CSV / TSV / .xlsx / セッション.json<br />上限: 20MiB・500要素（セッション.jsonは64MiBまで）<br />非対応: .xls・.xlsm・暗号化されたブック</>}>ファイルを読み込む</StepTitle>
      <div className="dropzone">
        <div className="dropzone-icon" aria-hidden="true">↑</div>
        <div className="dropzone-body">
          <strong>ファイルをドロップ、または選択</strong>
          <span className="muted">CSV / TSV / XLSX / セッションJSON</span>
          <div className="controls"><label className="file-label">入力ファイル<input type="file" accept=".csv,.tsv,.xlsx,.json" onChange={e => { const next = e.target.files?.[0]; if (next) choose(next); }} /></label><button className="ghost" onClick={() => choose(new File([sample], 'sample-chain.csv', { type: 'text/csv' }))}>サンプル A → B → C</button></div>
          {file && <p className="file-chip">{file.name}<span className="muted">{file.size.toLocaleString()} bytes</span></p>}
        </div>
      </div>
      {isSession && <p className="hint">セッションJSONでは保存済み条件を復元します。以下のCSV/XLSX取込設定は使いません。</p>}
      <div className="fields">
        <span className="with-tip"><label className="field">入力方向<select aria-label="入力方向" value={options.convention} onChange={e => update('convention', e.target.value as ImportOptions['convention'])}><option value="row-depends-on-column">行が列に依存</option><option value="row-supplies-column">行から列へ供給（転置）</option></select></label><Tip text="表の「1」が何を意味するかを選びます。「行が列に依存」では、行Bと列Aの交点が1のとき「BはAの結果を必要とする（A → B）」と読みます。逆向きに書いた表なら「転置」を選んでください。" /></span>
        <span className="with-tip"><label className="field">CSV文字コード<select aria-label="CSV文字コード" value={options.encoding} onChange={e => update('encoding', e.target.value as ImportOptions['encoding'])}><option value="utf-8">UTF-8（既定）</option><option value="shift_jis">Shift_JIS（明示指定）</option></select></label><Tip text="Excelで保存した日本語CSVが文字化けする場合は Shift_JIS を選んでください。" /></span>
        <label className="field">CSV区切り<select aria-label="CSV区切り" value={options.delimiter} onChange={e => update('delimiter', e.target.value as ImportOptions['delimiter'])}><option value="">推定</option><option value=",">カンマ</option><option value={'\t'}>タブ</option><option value=";">セミコロン</option></select></label>
        {/\.xlsx$/i.test(file?.name ?? '') && <><label className="field">シート名<input list="sheets" value={options.sheet} placeholder="空欄は最初のシート" onChange={e => update('sheet', e.target.value)} /><datalist id="sheets">{sheets.map(s => <option key={s} value={s} />)}</datalist></label><span className="with-tip"><label className="field">A1範囲<input value={options.range} placeholder="例 A1:D4" onChange={e => update('range', e.target.value)} /></label><Tip text="読み込むセル範囲をExcel形式で指定します（例 A1:D4）。空欄ならシートの使用範囲全体を読み込みます。" /></span></>}
      </div>
      <div className="controls">{check('labels', '先頭行・列がラベル', '1行目と1列目を要素名として扱います。名前のない数値だけの表ならオフにします。')}</div>
      <p className="direction-preview"><span className="direction-tag">読み方</span>{options.convention === 'row-depends-on-column' ? '行B・列Aの1は「BがAに依存」、A → B。' : '行B・列Aの1は「BからAへ供給」、B → A。取込時に転置します。'} 内部は常に「行が列に依存」です。</p>
      <details className="disclosure"><summary>値変換と詳細設定（既定では変換しません）</summary><div className="controls">{check('symbols', '記号 X / x / × を1へ変換', '「X」や「×」で依存を表した表を、数値の1として読み込みます。')}{check('blanks', '空セル=0', '空欄のセルを「依存なし（0）」として扱います。オフの場合、空欄はエラーになります。')}{check('diagonalBlanks', '対角の空セル・「-」=0', '対角（自分自身との交点）が空欄や「-」の表を読み込めるようにします。')}{check('cachedFormula', '保存済み計算値を利用（古い可能性・再計算なし）', 'Excelの数式セルについて、ファイルに保存されている最後の計算結果を使います。このアプリでは再計算しないため、値が古い可能性があります。')}{check('reorderColumns', '列照合案を適用', '行と列のラベル順が異なる場合に、列を行と同じ順に並べ替えます。プレビューに照合案が表示されたときに使います。')}</div></details>
      <div className="actions"><button className="primary" disabled={!file || busy} onClick={() => void inspect()}>検証してプレビュー</button><button className="ghost" disabled={!busy && !preview} onClick={cancel}>取込を取消</button>{busy && <span role="status" className="busy"><span className="spinner" aria-hidden="true" />{progressText || 'Workerで取込・検証中…（20秒上限）'}</span>}</div>
      {message && <p role="status" className="toast">{message}</p>}
    </section>
    {preview && <section className="panel preview" aria-labelledby="preview-title"><StepTitle no="02" id="preview-title" tip="ファイルをどう読み取ったかを確認する画面です。問題がなければ「このデータを確定」を押してください。元のファイルは変更しません。">プレビューを確認</StepTitle>
      <p className="meta">{preview.sourceName} / シート: {preview.source.sheet ?? 'CSV'} / 範囲: {preview.source.range ?? '全体'} / {preview.elapsedMs.toFixed(1)}ms</p>
      {preview.issueCount > 0 && <div role="alert" className="callout danger"><h3>エラー {preview.issueCount}件（先頭100件まで）</h3><ul>{preview.issues.map((issue, i) => <li key={i}><strong>{preview.sourceName} / {preview.source.sheet ?? 'CSV'} / {issue.cell}</strong>: 「{issue.original}」 {issue.reason} 修正: {issue.fix}</li>)}</ul></div>}
      {!!preview.columnProposal.length && <aside className="callout"><strong>列照合案（適用には詳細設定の選択と再検証が必要）</strong><p>{preview.columnProposal.join(' / ')}</p></aside>}
      {preview.warnings.map((warning, i) => <p className="callout warning" key={i}>注意: {warning}</p>)}
      <div className="preview-grid">
        <div><h3 className="sub">元セル表 <span className="muted">先頭8行・8列、変換前</span></h3><div className="table-scroll"><table aria-label="元セルプレビュー"><tbody>{preview.source.rows.slice(0, 8).map((row, i) => <tr key={i}>{row.slice(0, 8).map((cell, j) => <td key={j}>{cell.formula !== undefined ? `=${cell.formula}（保存値: ${cell.value ?? 'なし'}）` : String(cell.value ?? '')}</td>)}</tr>)}</tbody></table></div></div>
        {preview.matrix && <div><h3 className="sub">正規化後 <span className="muted">{preview.matrix.n} × {preview.matrix.n} / 行が列に依存（列 → 行）</span><Tip text="解析に使う形へ整えた行列です。どの形式で読み込んでも「行が列に依存」の向きにそろえます。" /></h3><div className="table-scroll"><table aria-label="正規化プレビュー"><tbody>{preview.matrix.elements.slice(0, 8).map((e, i) => <tr key={e.id}><th>{e.label} / {e.id}</th>{Array.from({ length: Math.min(8, preview.matrix!.n) }, (_, j) => <td key={j}>{preview.matrix!.values[i * preview.matrix!.n + j]}</td>)}</tr>)}</tbody></table></div></div>}
      </div>
      {preview.matrix && <><h3 className="sub">変換履歴</h3>{preview.matrix.provenance.transformations.length ? <ul className="plain-list">{preview.matrix.provenance.transformations.map((t, i) => <li key={i}>{t.kind}: {t.affectedCells}セル / {JSON.stringify(t.params)}</li>)}</ul> : <p className="muted">変換なし</p>}
      <details className="disclosure small"><summary>ファイルの指紋（SHA-256）</summary><p className="hash">原ファイル SHA-256: {preview.matrix.provenance.sourceSha256}<br />解析入力 SHA-256: {preview.inputHash}</p><p className="muted">同じ内容のファイルかどうかを確かめるための識別値です。</p></details></>}
      <div className="actions"><button className="primary" disabled={!preview.matrix || preview.issueCount > 0} onClick={commit}>このデータを確定</button><button className="ghost" onClick={cancel}>プレビューを取消</button></div>
    </section>}
    {matrix && <div className="next-step"><span>データを確定しました。</span><button className="primary" onClick={() => setTab('analysis')}>解析へ進む →</button></div>}
    </div>
    <AnalysisWorkspace key={matrix?.revision ?? 0} matrix={matrix} {...(active ? {source:active.source} : {})} restored={restored} tab={tab} onTab={setTab} onResultCount={setResultCount} />
    <footer>読み方: BがAに依存するなら行B・列Aが1、グラフはA → B。原データを変更せず、解析用行列を別に作ります。</footer>
  </main></>;
}
