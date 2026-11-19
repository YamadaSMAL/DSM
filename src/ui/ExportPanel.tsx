import { useEffect, useRef, useState } from 'react';
import type { SessionData } from '../io/session';
import { artifactMetadata } from '../io/artifact';
import { StepTitle, Tip } from './Tip';
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
    try{const result=await client.current.export(snapshot,format,(done,total)=>{if(token===generation.current&&total)setStatus(`保存済み結果を再計算して検証中 ${done}/${total}…`);});if(token!==generation.current)return;const url=URL.createObjectURL(new Blob([result.bytes],{type:result.mime})),link=document.createElement('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);setStatus(`${result.filename} を保存しました。`);}
    catch(error){if(token===generation.current)setStatus(error instanceof Error?error.message:String(error));}
    finally{if(token===generation.current)setBusy(false);}
  }
  return <section className="panel" aria-label="出力と保存"><StepTitle no="05" tip="結果をファイルに保存します。保存ファイルには入力ラベル・行列・来歴・解析結果が含まれるため、共有先を確認してください。出力開始時の選択結果と現在ビューを固定し、未実行の設定変更は含めません。">出力と保存</StepTitle><div className="fields"><label className="field wide">レポートタイトル<input aria-label="レポートタイトル" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label></div>
    <p className="meta">対象: {selected?`${selected.mode} / ${selected.algorithm.id} / ${selected.runId}`:'入力のみ（HTML/XLSXは結果（暫定を含む）の選択が必要）'}{current?` / ${current.runs.length}結果`:''}</p>
    <div className="actions export-actions"><span className="with-tip"><button className="primary" disabled={!selected||busy} onClick={()=>void save('html')}>単独HTMLを書き出す</button><Tip text="ブラウザだけで開けるレポート。元DSMと現在ビュー・概要・所属・指標・固定条件・比較一覧を含みます。結果の選択が必要です。" /></span><span className="with-tip"><button disabled={!selected||busy} onClick={()=>void save('xlsx')}>XLSXを書き出す</button><Tip text="Excel形式。元セル表と解析DSMを含みます。結果の選択が必要です。" /></span><span className="with-tip"><button disabled={!current||busy} onClick={()=>void save('json')}>セッションJSONを保存</button><Tip text="作業状態の保存用。元セル表・再現条件・全結果・undo/redo履歴を保存し、後で「入力ファイル」から読み込むと続きから作業できます。64MiB・100結果まで。" /></span><button disabled={!busy} onClick={()=>{generation.current++;client.current?.cancel();setBusy(false);setStatus('出力を取り消しました。');}}>出力を取消</button></div><p role="status" data-testid="export-status" className="status-line">{status}</p></section>;
}
