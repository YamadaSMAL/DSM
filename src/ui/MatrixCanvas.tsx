import { useEffect, useMemo, useRef, useState } from 'react';
import { preprocess, type MatrixData } from '../domain';
const SIDE = 620, MARGIN = 100;
export function MatrixCanvas({ matrix }: { matrix: MatrixData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(SIDE);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState({ row: 0, col: 0 });
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('original');
  const [threshold, setThreshold] = useState(0);
  const [binary, setBinary] = useState(false);
  const [log, setLog] = useState(false);
  const [diagonal, setDiagonal] = useState(true);
  const [alternative, setAlternative] = useState(false);
  const [table, setTable] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const analysis = useMemo(() => preprocess(matrix, { threshold, binary }), [matrix, threshold, binary]);
  const values = view === 'analysis' ? analysis.directed.values : matrix.values;
  const max = useMemo(() => values.reduce((a, b) => Math.max(a, b), 0), [values]);
  const cell = (SIDE - MARGIN) / matrix.n * zoom;
  const matches = matrix.elements.filter(e => query && (e.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()) || e.id.includes(query)));
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) setCanvasWidth(width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function focusElement(index: number) {
    setSelected({ row: index, col: index });
    const maxPan = Math.max(0, matrix.n * cell - (SIDE - MARGIN));
    setPan({ x: Math.min(maxPan, Math.max(0, index * cell - 200)), y: Math.min(maxPan, Math.max(0, index * cell - 200)) });
  }
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const dpr = window.devicePixelRatio || 1;
    node.width = SIDE * dpr; node.height = SIDE * dpr;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fffefa'; ctx.fillRect(0, 0, SIDE, SIDE);
    const firstRow = Math.max(0, Math.floor(pan.y / cell)), firstCol = Math.max(0, Math.floor(pan.x / cell));
    const lastRow = Math.min(matrix.n, Math.ceil((pan.y + SIDE - MARGIN) / cell));
    const lastCol = Math.min(matrix.n, Math.ceil((pan.x + SIDE - MARGIN) / cell));
    ctx.save(); ctx.beginPath(); ctx.rect(MARGIN, MARGIN, SIDE - MARGIN, SIDE - MARGIN); ctx.clip();
    for (let r = firstRow; r < lastRow; r++) for (let c = firstCol; c < lastCol; c++) {
      const v = values[r * matrix.n + c]!;
      const intensity = max === 0 ? 0 : log ? Math.log1p(v) / Math.log1p(max) : v / max;
      ctx.fillStyle = r === c ? '#d9dfd6' : v > 0 ? alternative ? `rgb(${240 - 180 * intensity},${235 - 150 * intensity},${250 - 50 * intensity})` : `rgb(${220 - 195 * intensity},${240 - 130 * intensity},${223 - 150 * intensity})` : '#f5f6f0';
      if (r === c && !diagonal) ctx.fillStyle = '#f5f6f0';
      const x = MARGIN + c * cell - pan.x, y = MARGIN + r * cell - pan.y;
      const px = Math.round(x * dpr) / dpr, py = Math.round(y * dpr) / dpr;
      const gap = cell > 5 ? 1 : 0;
      ctx.fillRect(px, py, Math.max(1 / dpr, Math.round((x + cell) * dpr) / dpr - px - gap), Math.max(1 / dpr, Math.round((y + cell) * dpr) / dpr - py - gap));
      if (cell * canvasWidth / SIDE >= 28 && (r !== c || diagonal)) { ctx.fillStyle = intensity > .7 && v > 0 ? '#fff' : '#17352e'; ctx.font = `${12 * SIDE / canvasWidth}px system-ui`; ctx.fillText(String(v).slice(0, 7), x + 4, y + cell / 2 + 4); }
    }
    const active = hover ?? selected;
    ctx.strokeStyle = '#b46925'; ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN, MARGIN + active.row * cell - pan.y, SIDE - MARGIN, cell);
    ctx.strokeRect(MARGIN + active.col * cell - pan.x, MARGIN, cell, SIDE - MARGIN);
    ctx.strokeStyle = '#153f33'; ctx.lineWidth = 3;
    ctx.strokeRect(MARGIN + selected.col * cell - pan.x, MARGIN + selected.row * cell - pan.y, cell, cell);
    ctx.restore();

  }, [matrix, values, max, zoom, pan, selected, hover, log, diagonal, alternative, cell, canvasWidth]);
  const row = matrix.elements[selected.row]!, col = matrix.elements[selected.col]!;
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * SIDE / rect.width, y: (event.clientY - rect.top) * SIDE / rect.height };
  }
  function hit(x: number, y: number) {
    const r = Math.floor((y - MARGIN + pan.y) / cell), c = Math.floor((x - MARGIN + pan.x) / cell);
    return x >= MARGIN && y >= MARGIN && r >= 0 && c >= 0 && r < matrix.n && c < matrix.n ? { row: r, col: c } : null;
  }
  const headerStep = Math.max(1, Math.ceil(18 / cell));
  const headerIndices = (axis: 'x' | 'y') => Array.from({ length: matrix.n }, (_, i) => i).filter(i => i % headerStep === 0 && i * cell >= pan[axis] - cell && i * cell < pan[axis] + SIDE - MARGIN);
  return <section className="panel matrix-panel" aria-labelledby="matrix-title">
    <h2 id="matrix-title">DSM · {matrix.n}要素</h2>
    <div className="controls">
      <label>表示<select aria-label="表示" value={view} onChange={e => setView(e.target.value)}><option value="original">元DSM（方向正規化済み）</option><option value="analysis">解析DSM（D）</option></select></label>
      <label>解析閾値<input type="number" min="0" step="any" value={threshold} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setThreshold(v); }} /></label>
      <label><input type="checkbox" checked={binary} onChange={e => setBinary(e.target.checked)} />閾値適用後に二値化</label>
      <label><input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} />対数配色</label>
      <label><input type="checkbox" checked={diagonal} onChange={e => setDiagonal(e.target.checked)} />元対角を表示</label>
      <label><input type="checkbox" checked={alternative} onChange={e => setAlternative(e.target.checked)} />代替配色</label>
    </div>
    <div className="controls">
      <label>ズーム<input aria-label="ズーム" type="range" min="1" max={Math.max(20, matrix.n / 10)} step="0.5" value={zoom} onChange={e => { const z = Number(e.target.value); setZoom(z); const limit = (SIDE - MARGIN) * (z - 1); setPan(p => ({ x: Math.min(p.x, limit), y: Math.min(p.y, limit) })); }} /></label><output>{zoom.toFixed(1)}倍</output>
      <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>全体表示</button>
      <label>検索<input type="search" placeholder="ラベル / ID" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {query && <div className="search-results" aria-label="検索結果">{matches.length}件 {matches.map(e => <button key={e.id} onClick={() => focusElement(e.originalIndex)}>{e.label} · {e.id}</button>)}</div>}
    <p>行が列に依存します。ドラッグでパン、矢印キーでセル移動。クリックで詳細を固定します。</p>
    <div className="matrix-layout"><div className="canvas-wrap"><div className="row-headers" aria-label="行見出し">{headerIndices('y').map(i => <span key={i} title={`${matrix.elements[i]!.label} / ${matrix.elements[i]!.id}`} style={{ top: `${(MARGIN + i * cell - pan.y) / SIDE * 100}%` }}>{matrix.elements[i]!.label}</span>)}</div><div className="col-headers" aria-label="列見出し">{headerIndices('x').map(i => <span key={i} title={`${matrix.elements[i]!.label} / ${matrix.elements[i]!.id}`} style={{ left: `${(MARGIN + i * cell - pan.x) / SIDE * 100}%` }}>{matrix.elements[i]!.label}</span>)}</div><canvas ref={canvas} style={{ width: '100%', maxWidth: SIDE, aspectRatio: '1', touchAction: 'none' }} tabIndex={0} role="grid" aria-label="DSM行列。矢印キーでセルを選択" aria-describedby="cell-detail"
      onPointerDown={e => { const p = point(e); drag.current = { ...p, panX: pan.x, panY: pan.y, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const p = point(e); const d = drag.current; if (d) { if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 4) d.moved = true; if (d.moved) { const limit = Math.max(0, matrix.n * cell - (SIDE - MARGIN)); setPan({ x: Math.max(0, Math.min(limit, d.panX + d.x - p.x)), y: Math.max(0, Math.min(limit, d.panY + d.y - p.y)) }); } } else setHover(hit(p.x, p.y)); }}
      onPointerUp={e => { const p = point(e); if (!drag.current?.moved) { const target = hit(p.x, p.y); if (target) setSelected(target); } drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => setHover(null)}
      onKeyDown={e => { const dirs: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }; const d = dirs[e.key]; if (!d) return; e.preventDefault(); const r = Math.max(0, Math.min(matrix.n - 1, selected.row + d[0])), c = Math.max(0, Math.min(matrix.n - 1, selected.col + d[1])); setSelected({ row: r, col: c }); setPan(p => ({ x: Math.max(0, Math.min(Math.max(p.x, (c + 1) * cell - (SIDE - MARGIN)), c * cell)), y: Math.max(0, Math.min(Math.max(p.y, (r + 1) * cell - (SIDE - MARGIN)), r * cell)) })); }} /></div>
    <aside id="cell-detail" aria-live="polite" className="cell-detail">
      <h3>セル詳細</h3><p>行: {row.label}（{row.id}）<br />列: {col.label}（{col.id}）</p>
      <p>元位置 / 現位置: 行{selected.row + 1}・列{selected.col + 1}</p>
      <p>値: <strong>{values[selected.row * matrix.n + selected.col]}</strong> / 元値: {matrix.values[selected.row * matrix.n + selected.col]}</p>
      <p>{selected.row === selected.col ? '対角値は原データとして保持し、解析から除外します。' : `${row.label} が ${col.label} に依存。情報の方向: ${col.label} → ${row.label}`}</p>
      <p>所属: 未解析（構造・工程の解析はM2）</p>
      <p>閾値で除外した非ゼロセル: {analysis.transformations.find(t => t.kind === 'threshold')?.affectedCells}件</p>
    </aside></div>
    <button onClick={() => setTable(!table)} aria-expanded={table}>選択行の表形式表示</button>
    {table && <div className="table-scroll"><table><caption>{row.label} の行</caption><thead><tr><th>列 / ID</th><th>値</th><th>原値</th></tr></thead><tbody>{matrix.elements.map((e, j) => <tr key={e.id}><th>{e.label} / {e.id}</th><td>{values[selected.row * matrix.n + j]}</td><td>{matrix.values[selected.row * matrix.n + j]}</td></tr>)}</tbody></table></div>}
  </section>;
}
