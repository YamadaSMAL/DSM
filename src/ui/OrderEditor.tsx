import { Tip } from './Tip';
import { identityOrder, type MatrixData } from '../domain';
import { moveElement, redo, setOrder, undo, type ViewHistory } from '../state/views';
export function OrderEditor({ matrix, history, analysisOrder, onChange }: { matrix: MatrixData; history: ViewHistory; analysisOrder: readonly number[]; onChange: (history: ViewHistory) => void }) {
  return <details className="order-editor disclosure"><summary>表示順を手動で変更（行・列を同時に移動）</summary>
    <div className="actions"><Tip text="項目をドラッグ、または項目にフォーカスして上下矢印キーで移動します。行と列が同時に並び替わります。元の解析結果は保持し、履歴は直近100変更まで戻せます。" /><button className="ghost small" onClick={() => onChange(setOrder(history, identityOrder(matrix.n)))}>元順へ戻す</button><button className="ghost small" onClick={() => onChange(setOrder(history, analysisOrder))}>解析順へ戻す</button><button className="ghost small" disabled={!history.past.length} onClick={() => onChange(undo(history))}>undo</button><button className="ghost small" disabled={!history.future.length} onClick={() => onChange(redo(history))}>redo</button></div>
    <ol className="order-list" aria-label="表示順の編集">{history.order.map((i, position) => <li key={i} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const text = e.dataTransfer.getData('text/plain'); if (!/^\d+$/.test(text)) return; const original = Number(text); onChange(moveElement(history, history.order.indexOf(original), position)); }}>
      <button draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(moveElement(history, position, position + (e.key === 'ArrowUp' ? -1 : 1))); } }} aria-label={`順序 ${matrix.elements[i]!.label} ${matrix.elements[i]!.id}`}>{position + 1}. {matrix.elements[i]!.label} · {matrix.elements[i]!.id}</button>
    </li>)}</ol>
  </details>;
}
