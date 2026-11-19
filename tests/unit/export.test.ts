import { describe, expect, it } from 'vitest';
import { read } from 'xlsx';
import { importFile } from '../../src/io/import';
import { defaultOptions } from '../../src/io/types';
import { runAnalysis } from '../../src/algorithms/registry';
import { initialView, moveElement } from '../../src/state/views';
import { parseSession, serializeSession, validateSession, rebaseSession, SESSION_LIMIT, type SessionData } from '../../src/io/session';
import { prepareExport } from '../../src/io/prepareExport';
import { htmlExport } from '../../src/io/htmlExport';
import { xlsxExport } from '../../src/io/xlsxExport';
import { outputFilename } from '../../src/io/artifact';
import { analysisInputHash } from '../../src/domain';
const encode=(s:string)=>new TextEncoder().encode(s).buffer;
const meta={createdAt:'2026-11-16T00:01:02.000Z',timeZone:'Asia/Tokyo',appVersion:'0.1.0',appCommit:'test-commit',userAgent:'Test browser'};
export async function sampleSession(process=false):Promise<SessionData>{
  const preview=await importFile(encode(',A,B,C\nA,7,0,0\nB,2,0,0\nC,0,3,0'),'日本語.csv',defaultOptions,1),input=preview.matrix!;
  const run=await runAnalysis(input,process?'scc-tarjan-kahn-v1':'hierarchical-average-v1',{k:2,alpha:1},{threshold:0,binary:false},'run-1');
  return {schemaVersion:1,kind:'dsm-session',title:'日本語のDSM',metadata:meta,input,source:preview.source,runs:[run],views:{'run-1':initialView(run.order)},selectedRunId:'run-1',settings:{algorithmId:run.algorithm.id,options:run.options,parameters:run.parameters,color:{log:false,alternative:false}}};
}
describe('セッション保存と再検証',()=>{
  it.each([false,true])('元セル・入力・結果・ビューのJSON往復、同条件再実行（工程=%s）',async process=>{
    const session=await sampleSession(process);session.views['run-1']=moveElement(session.views['run-1']!,0,2);const text=serializeSession(session),loaded=await parseSession(encode(text));
    expect(loaded.input.values).toBeInstanceOf(Float64Array);expect(loaded.input.values).toEqual(session.input.values);expect(loaded.source).toEqual(session.source);expect(loaded.views).toEqual(session.views);expect(loaded.runs[0]!.metrics).toEqual(session.runs[0]!.metrics);
    const rerun=await runAnalysis(loaded.input,loaded.settings.algorithmId,loaded.settings.parameters,loaded.settings.options);expect(rerun.order).toEqual(loaded.runs[0]!.order);expect(rerun.metrics).toEqual(loaded.runs[0]!.metrics);
    const rebased=rebaseSession(loaded,10);expect(rebased.runs[0]!.dataRevision).toBe(10);expect(await analysisInputHash(rebased.input,rerun.options)).toBe(rerun.inputHash);
  });
  it('入力のみのセッションを保存でき、結果出力は拒否する',async()=>{const s=await sampleSession();s.runs=[];s.views={};s.selectedRunId='';expect((await parseSession(encode(serializeSession(s)))).runs).toEqual([]);await expect(prepareExport(s)).rejects.toThrow('完了結果');});
  it.each(['schema','shape','id','negative','source','order','membership','metrics','hash','revision','version','parameters','view','prototype','settings','tree','celltype'])('不正な%sを拒否する',async kind=>{
    const session=await sampleSession(),raw=JSON.parse(serializeSession(session));
    if(kind==='celltype')raw.source.rows[1][1].type='bogus';if(kind==='schema')raw.schemaVersion=999;if(kind==='shape')raw.input.values.pop();if(kind==='id')raw.input.elements[0].id='bad';if(kind==='negative')raw.input.values[0]=-1;if(kind==='source')raw.source.rows[2][1].value='99';
    if(kind==='order')raw.runs[0].order=[0,0,2];if(kind==='membership')raw.runs[0].membership[0]=-1;if(kind==='metrics')raw.runs[0].metrics.coordinationCost+=1;if(kind==='hash')raw.runs[0].inputHash='0'.repeat(64);if(kind==='revision')raw.runs[0].dataRevision=2;if(kind==='version')raw.runs[0].algorithm.version='999';if(kind==='parameters')raw.runs[0].parameters.k=99;if(kind==='view')raw.views['run-1'].past=[[2,2,0]];if(kind==='prototype')raw.views=JSON.parse('{"__proto__":{}}');if(kind==='settings')raw.settings.options.threshold=3;if(kind==='tree')raw.runs[0].hierarchy.merges[0].distance+=.1;
    await expect(validateSession(raw)).rejects.toThrow();
  });
  it('不正なSCC/Band・原数式・型を拒否する',async()=>{const s=await sampleSession(true);s.runs[0]!.scc!.bandByElement[0]=99;await expect(validateSession(s)).rejects.toThrow();const x=await sampleSession();x.source.rows[1]![1]!.formula='1+1';await expect(validateSession(x)).rejects.toThrow();await expect(parseSession(encode('{"schemaVersion":1}'))).rejects.toThrow();await expect(parseSession(encode('no json'))).rejects.toThrow();});
  it('サイズ超過と深い入れ子を拒否する',async()=>{await expect(parseSession(new ArrayBuffer(SESSION_LIMIT+1))).rejects.toThrow('64MiB');const s=await sampleSession();let nested:unknown={};for(let i=0;i<40;i++)nested={next:nested};(s.input.provenance.importOptions as Record<string,unknown>)['deep']=nested;await expect(validateSession(s)).rejects.toThrow('入れ子');});
});
describe('XLSXの区別と型',()=>{
  it('9シート、元対角・解析・同時置換・元セル、指標・条件を保持する',async()=>{
    const session=await sampleSession(true);session.views['run-1']=moveElement(session.views['run-1']!,0,2);const prepared=await prepareExport(session),book=read(xlsxExport(prepared),{type:'array',cellStyles:true});
    expect(book.SheetNames).toEqual(['README','SourceMatrix','OriginalDSM','AnalysisDSM','ReorderedDSM','Elements','Metrics','RunConfig','Comparison']);
    expect(book.Sheets['OriginalDSM']!['B3']!.v).toBe(7);expect(book.Sheets['AnalysisDSM']!['B3']!.v).toBe(0);expect(book.Sheets['ReorderedDSM']!['D3']!.v).toBe(2);expect(book.Sheets['SourceMatrix']!['B3']!.v).toBe('7');expect(book.Sheets['Elements']!['D3']!.v).toBe(3);expect(book.Sheets['Metrics']!['D2']!.t).toBe('n');expect(book.Sheets['README']!['!cols']![0]!.wch).toBeGreaterThan(20);
    const reimport=await importFile(xlsxExport(prepared),'roundtrip.xlsx',{...defaultOptions,sheet:'OriginalDSM',range:'A2:D5'},2);expect(reimport.matrix!.values).toEqual(session.input.values);expect(reimport.matrix!.elements).toEqual(session.input.elements);
    const entries:Record<string,string>={};const configSheet=book.Sheets['RunConfig']!;for(let r=2;configSheet['A'+r];r++)entries[String(configSheet['A'+r]!.v)]=String(configSheet['B'+r]!.v??'');
    const rerun=await runAnalysis(reimport.matrix!,JSON.parse(entries['algorithm']!).id,JSON.parse(entries['parameters']!),JSON.parse(entries['options']!));expect(rerun.metrics).toEqual(session.runs[0]!.metrics);expect(rerun.sccMembership).toEqual(session.runs[0]!.sccMembership);
    for(let i=0;i<session.input.n;i++){expect(book.Sheets['Elements']!['B'+(i+3)]!.v).toBe(session.input.elements[i]!.label);expect(book.Sheets['Elements']!['D'+(i+3)]!.v).toBe(prepared.order.indexOf(i)+1);expect(book.Sheets['Elements']!['F'+(i+3)]!.v).toBe(session.runs[0]!.sccMembership![i]!+1);for(let j=0;j<session.input.n;j++){const col=String.fromCharCode(66+j);expect(book.Sheets['ReorderedDSM']![col+(i+3)]!.v).toBe(prepared.reordered.values[i*session.input.n+j]);}}

    expect(prepared.orderGuaranteed).toBe(false);expect(Object.values(book.Sheets['RunConfig']!).some(v=>typeof v==='object'&&v?.v===session.runs[0]!.inputHash)).toBe(true);
  });
  it('ラベルと原数式を文字列にし、式・リンクを生成しない',async()=>{
    const session=await sampleSession();const label='=HYPERLINK("https://example.invalid")';session.source.rows[0]![1]!.value=label;session.source.rows[1]![0]!.value=label;const preview=await importFile(encode(',"=HYPERLINK(""x"")",B\n"=HYPERLINK(""x"")",0,0\nB,1,0'),'formula.csv',defaultOptions,1);expect(preview.issueCount).toBe(0);
    // Rebuild session from an XLSX with a numeric formula cache.
    const {utils,write}=await import('xlsx');const workbook=utils.book_new(),sheet=utils.aoa_to_sheet([['',label,'B'],[label,0,0],['B',1,0]]);sheet['B3']={t:'n',v:2,f:'1+1'};utils.book_append_sheet(workbook,sheet,'Data');
    const p=await importFile(write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer,'formula.xlsx',{...defaultOptions,cachedFormula:true},1);const run=await runAnalysis(p.matrix!,'scc-tarjan-kahn-v1',{},{} ,'run-1');const s:SessionData={...session,input:p.matrix!,source:p.source,runs:[run],views:{'run-1':initialView(run.order)},settings:{...session.settings,algorithmId:run.algorithm.id,parameters:run.parameters,options:run.options}};
    const restored=read(xlsxExport(await prepareExport(s)),{type:'array'});expect(restored.Sheets['SourceMatrix']!['B4']!.v).toBe('=1+1');expect(restored.Sheets['OriginalDSM']!['B2']!.t).toBe('s');
    for(const ws of Object.values(restored.Sheets))for(const [key,cell]of Object.entries(ws))if(!key.startsWith('!')){expect(cell.f).toBeUndefined();expect(cell.l).toBeUndefined();}
  });
});
it('HTMLは自己完結で、埋込JSON・静的文字列を安全に直列化する',async()=>{
  const s=await sampleSession(),label='</script><img src=x onerror=alert(1)>';
  s.title=label;s.source.rows[0]![1]!.value=label;s.source.rows[1]![0]!.value=label;
  // A matching accepted input is required, even for malicious-looking labels.
  const {validateTable}=await import('../../src/io/validate');const preview=await validateTable(s.source,defaultOptions,'test.csv','0'.repeat(64),1);s.input=preview.matrix!;s.runs=[await runAnalysis(s.input,'hierarchical-average-v1',{k:2,alpha:1},{},'run-1')];s.views={'run-1':initialView(s.runs[0]!.order)};
  const html=htmlExport(await prepareExport(s));expect(html).toContain('\\u003c/script>');expect(html).toContain('&lt;img');expect(html).not.toContain('<img src=x');expect(html).not.toMatch(/<script[^>]+src=/);expect(html).toContain('connect-src \'none\'');expect(html).toContain('<noscript>');expect(html.match(/<canvas /g)).toHaveLength(2);
});
it('日時とタイムゾーンを使い安全な既定名を作る',()=>{expect(outputFilename('../日本語 <x>.csv','html',meta)).toBe('dsm____日本語__x__20261116-090102.html');});
it.each(['igta-plus-paper-informed-v1','igta-pp-gigta-paper-informed-v1'])('%s exports validated diagnostic points in HTML and the existing nine XLSX sheets',async id=>{
  const s=await sampleSession(),run=await runAnalysis(s.input,id,{seed:0,clusterSlots:2,populationSize:4,generations:2,maxProposals:100},s.settings.options,'run-1');
  s.runs=[run];s.views={'run-1':initialView(run.order)};s.settings={...s.settings,algorithmId:id,parameters:run.parameters,seed:0};
  const prepared=await prepareExport(s),html=htmlExport(prepared),book=read(xlsxExport(prepared),{type:'array'}),{utils}=await import('xlsx');
  expect(html).toContain('aria-label="探索経過グラフ"');expect(html).toContain('クラスタ規模分布');expect(html).toContain('<td>'+run.history!.points.at(-1)!.value+'</td>');expect(book.SheetNames).toHaveLength(9);
  const metrics=utils.sheet_to_json(book.Sheets['Metrics']!,{header:1}) as unknown[][],header=metrics.findIndex(row=>row[0]==='反復数'&&row[1]==='評価回数');expect(header).toBeGreaterThan(0);
  expect(metrics.slice(header+1)).toEqual(run.history!.points.map(p=>[p.iteration,p.evaluations,p.value,p.best]));
  const config=utils.sheet_to_json(book.Sheets['RunConfig']!,{header:1}) as unknown[][];expect(JSON.parse(config.find(row=>row[0]==='history')![1] as string)).toEqual(run.history);
});
