import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * 初心者向けの補足説明。マウスオーバー・キーボードフォーカス・タップで表示する。
 * children を渡すと点線下線の用語、省略すると「?」アイコンになる。
 * 説明文はDOM上に常に存在し（非表示時は visibility:hidden）、支援技術には aria-describedby で関連付ける。
 * バブルは position:fixed で配置するため、スクロール領域や表の中でも切れない。
 */
export function Tip({ text, children, label = '説明' }: { text: ReactNode; children?: ReactNode; label?: string }) {
  const id = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const half = Math.min(150, window.innerWidth / 2 - 8);
    const above = rect.top > 180;
    setPosition({ left: Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8), top: above ? rect.top - 8 : rect.bottom + 8, above });
  }
  const hide = () => setPosition(null);
  useEffect(() => {
    if (!position) return;
    const close = (event: Event) => { if (event.type !== 'keydown' || (event as KeyboardEvent).key === 'Escape') hide(); };
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', close); };
  }, [position]);
  const bubble = <span role="tooltip" id={id} className={`tip-bubble${position ? ' open' : ''}${position?.above ? ' above' : ''}`} style={position ? { left: position.left, top: position.top } : undefined}>{text}</span>;
  const events = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
  if (children !== undefined) return <span className="tip-term" tabIndex={0} aria-describedby={id} ref={node => { trigger.current = node; }} {...events}>{children}{bubble}</span>;
  return <span className="tip">
    <button type="button" className="tip-icon" aria-label={label} aria-describedby={id} ref={node => { trigger.current = node; }} {...events} onClick={event => { event.preventDefault(); if (position) hide(); else show(); }}>?</button>{bubble}
  </span>;
}

/** 見出し。手順番号は画面に出さず（タブ番号と重複するため）、読み上げ名は「02 · タイトル」のまま保つ。 */
export function StepTitle({ no, children, id, tip }: { no?: string; children: ReactNode; id?: string; tip?: ReactNode }) {
  return <div className="step-title">
    <h2 id={id}>{no && <span className="sr-only">{no} · </span>}{children}</h2>
    {tip && <Tip text={tip} />}
  </div>;
}
