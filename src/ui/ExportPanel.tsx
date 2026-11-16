import { useEffect, useRef, useState } from 'react';
import type { SessionData } from '../io/session';
import { artifactMetadata } from '../io/artifact';
import { ArtifactClient } from '../workers/artifactClient';
import type { ArtifactFormat } from '../workers/artifactProtocol';
export function ExportPanel({capture}:{capture:()=>SessionData|null}){
  const [title,setTitle]=useState(()=>capture()?.title ?? 'DSM解析レポート'),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const client=useRef<ArtifactClient|null>(null),generation=useRef(0);
  useEffect(()=>()=>{generation.current++;client.current?.cancel();},[]);
  const current=capture(),selected=current?.runs.find(r=>r.runId===current.selectedRunId);
  async function save(format:ArtifactFormat){
    const data=capture();if(!data)return;
    const token=++generation.current;
    // Capture before awaiting: subsequent run/view selections cannot change this export.
    const snapshot=structuredClone({...data,title,metadata:artifactMetadata()});
    setBusy(true);setStatus('Workerでスナップショットと指標を再検証して出力中…');client.current??=new ArtifactClient();
    try{const result=await client.current.export(snapshot,format);if(token!==generation.current)return;const url=URL.createObjectURL(new Blob([result.bytes],{type:result.mime})),link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);setStatus(`${result.filename} を保存しました。`);}
    catch(error){if(token===generation.current)setStatus(error instanceof Error?error.message:String(error));}
    finally{if(token===generation.current)setBusy(false);}
  }
  return <section className="panel" aria-label="出力と保存"><h2>05 · 出力と保存</h2><p>保存ファイルには入力ラベル・行列・来歴・解析結果が含まれます。共有先を確認してください。出力開始時の選択結果と現在ビューを固定し、未実行の設定変更は含めません。</p><label>レポートタイトル<input aria-label="レポートタイトル" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <p>対象: {selected?`${selected.mode} / ${selected.algorithm.id} / ${selected.runId}`:'入力のみ（HTML/XLSXは完了結果の選択が必要）'}<br/>内容: HTMLは元DSMと現在ビュー・概要・所属・指標・固定条件・比較一覧。XLSXは元セル表と解析DSM、JSONは元セル表と再現条件を保存します{current?` / ${current.runs.length}結果`:''}。JSONは全結果とundo/redo履歴も保存します。</p>
    <div className="actions"><button disabled={!selected||busy} onClick={()=>void save('html')}>単独HTMLを書き出す</button><button disabled={!selected||busy} onClick={()=>void save('xlsx')}>XLSXを書き出す</button><button disabled={!current||busy} onClick={()=>void save('json')}>セッションJSONを保存</button><button disabled={!busy} onClick={()=>{generation.current++;client.current?.cancel();setBusy(false);setStatus('出力を取り消しました。');}}>出力を取消</button></div><p role="status" data-testid="export-status">{status}</p><p>セッションは64MiB・100結果まで。JSONの再読込は上の入力ファイルで選択し、検証・プレビュー後に確定してください。</p></section>;
}
