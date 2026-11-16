import { utils, write } from 'xlsx';
import type { PreparedExport } from './prepareExport';
import type { DenseMatrix } from '../domain';
type Value=string|number|boolean|null;
export function xlsxExport(data: PreparedExport): ArrayBuffer {
  const {session,selected,order,analysis,reordered}=data, input=session.input, book=utils.book_new();
  function sheet(name:string, rows:Value[][]) {
    for(const row of rows)for(const v of row)if(typeof v==='string'&&v.length>32767)throw new Error(`${name}: Excelのセル文字列上限32767文字を超えています。JSON保存を利用してください。`);
    const worksheet=utils.aoa_to_sheet(rows);
    worksheet['!cols']=Array.from({length:Math.max(...rows.map(r=>r.length))},(_,i)=>({wch:i===0?28:20}));
    // aoa_to_sheet writes strings as t:s. Never generate f or l from source strings.
    utils.book_append_sheet(book,worksheet,name);
  }
  function matrixRows(title:string,matrix:DenseMatrix,indices:readonly number[]):Value[][] {
    return [[title],['',...indices.map(i=>input.elements[i]!.label)],...indices.map((i,r)=>[input.elements[i]!.label,...Array.from({length:matrix.n},(_,c)=>matrix.values[r*matrix.n+c]!)])];
  }
  const sheets:Value[][]=[['シート','内容'],['SourceMatrix','選択範囲の変換前セル。原数式は文字列。'],['OriginalDSM','方向正規化後A、元順、元対角を保持。取込範囲はA2から。'],['AnalysisDSM','解析Dまたはmean S、元順、対角0。'],['ReorderedDSM','選択ビュー順にAnalysisDSMを同時置換。'],['Elements','元順位・表示順位・構造クラスタまたはSCC・Band。'],['Metrics','元解析と現在ビューの指標。'],['RunConfig','固定条件・来歴・版・環境。'],['Comparison','他結果の条件と比較可否。']];
  sheet('README',[[session.title],['依存方向','A[i,j]は行iが列jに依存。グラフはj→i。Sは無向mean重み。'],['作成日時',session.metadata.createdAt],['タイムゾーン',session.metadata.timeZone],['アプリ版',session.metadata.appVersion],['アプリcommit',session.metadata.appCommit],['入力SHA-256',selected.inputHash],['原ファイルSHA-256',input.provenance.sourceSha256],['手動ビューの先行順保証',data.orderGuaranteed],...sheets]);
  sheet('SourceMatrix',[['変換前セル表 / '+(session.source.sheet??'CSV')+' / '+(session.source.range??'全体')],...session.source.rows.map(row=>row.map(cell=>cell.formula!==undefined?`=${cell.formula}`:cell.value))]);
  const originalOrder=Array.from({length:input.n},(_,i)=>i);
  sheet('OriginalDSM',matrixRows('元DSM: 方向正規化A / 元順 / 元対角を保持',input,originalOrder));
  sheet('AnalysisDSM',matrixRows(`解析DSM: ${selected.mode==='structure'?'S・無向mean':'D・有向'} / 元順 / 対角0`,analysis,originalOrder));
  sheet('ReorderedDSM',matrixRows('現在ビュー: 解析DSMの行列同時置換 / 元結果は保持',reordered,order));
  sheet('Elements',[['所属は元indexで保持。順位は1始まり。Bandは0始まり。'],['ID','ラベル','元順位','表示順位','構造クラスタ','SCC','Band（元解析）','Band（現在ビュー）'],...input.elements.map(e=>[e.id,e.label,e.originalIndex+1,order.indexOf(e.originalIndex)+1,selected.membership?selected.membership[e.originalIndex]!+1:null,selected.scc?selected.scc.membership[e.originalIndex]!+1:null,selected.scc?.bandByElement[e.originalIndex]??null,data.orderGuaranteed?(selected.scc?.bandByElement[e.originalIndex]??null):null])]);
  sheet('Metrics',[['範囲','指標','版','値','意味・方向','単位','未定義理由'],...(['元解析','現在ビュー'] as const).flatMap(scope=>Object.entries(scope==='元解析'?selected.metrics:data.currentMetrics).map(([key,value])=>[scope,key,Object.values(selected.metricVersions).join(','),value,selected.mode==='structure'?'mean S / 無向ペア':'D / 上三角がフィードバック',key.endsWith('Ratio')?'比率':key.endsWith('Count')?'件':key.includes('Weight')?'入力重み':'指標定義に従う',value===null?'関係なし':'']))]);
  const config:Value[][]=[['項目','値（長いJSONは連番で分割）']];
  const fields={...session.metadata,analysisEnvironment:selected.environment??{recorded:false},sourceName:input.provenance.sourceName,sourceSha256:input.provenance.sourceSha256,inputHash:selected.inputHash,convention:input.convention,dataRevision:selected.dataRevision,algorithm:selected.algorithm,parameters:selected.parameters,preprocessing:selected.preprocessing,importOptions:input.provenance.importOptions,importTransformations:input.provenance.transformations,options:selected.options,status:selected.status,stopReason:selected.stopReason,iterations:selected.iterations,evaluations:selected.evaluations,elapsedMs:selected.elapsedMs,seed:selected.seed??'なし（決定的手法）',prngVersion:selected.prngVersion??'なし',batch:selected.batch??null,initialState:selected.initialState??null,trace:selected.trace??null,converged:selected.converged??'未定義',order,orderGuaranteed:data.orderGuaranteed,warnings:selected.warnings};
  for(const [key,value]of Object.entries(fields)){const text=typeof value==='string'?value:JSON.stringify(value);for(let i=0;i<text.length||i===0;i+=30000)config.push([text.length>30000?`${key} [${i/30000+1}/${Math.ceil(text.length/30000)}]`:key,text.slice(i,i+30000)]);}
  sheet('RunConfig',config);
  sheet('Comparison',[['各runは元解析の指標。手動ビュー指標とは別。'],['runId','モード','手法','入力ハッシュ','条件','比較可否','指標','値','状態'],...data.comparisons.flatMap(({run,comparable})=>Object.entries(run.metrics).map(([key,value])=>[run.runId,run.mode,run.algorithm.id,run.inputHash,JSON.stringify({parameters:run.parameters,options:run.options,metricVersions:run.metricVersions,seed:run.seed??null,prngVersion:run.prngVersion??null,batch:run.batch??null}),run.status!=='completed'||run.converged===false?'比較不可（暫定・未収束）':comparable?'同条件':'比較不可（条件差）',key,value,run.status])),[],['複数seed集計（成功例のみ・母標準偏差）'],['batchId','手法','rootSeed','成功数/試行数','最良','中央値','最悪','母標準偏差','試行seed'],...data.batches.map(b=>[b.batch.id,b.algorithmId,b.batch.rootSeed,`${b.successful}/${b.batch.count}`,b.best,b.median,b.worst,b.standardDeviation,b.records.map(r=>r.seed).join(',')])]);
  return write(book,{type:'array',bookType:'xlsx',compression:true}) as ArrayBuffer;
}
