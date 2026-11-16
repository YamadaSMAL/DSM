import { analysisInputHash, assertPermutation, canonicalAnalysisInput, type MatrixData } from '../domain';
import { algorithms, runAnalysis } from '../algorithms/registry';
import type { RunResult } from '../algorithms/types';
import type { ViewHistory } from '../state/views';
import { defaultOptions, type ImportOptions, type SourceTable } from './types';
import { coordinate, validateTable } from './validate';
export const SESSION_LIMIT = 64 * 1024 * 1024;
export interface ArtifactMetadata { createdAt: string; timeZone: string; appVersion: string; appCommit: string; userAgent: string }
export interface SessionSettings { algorithmId: string; options: { threshold: number; binary: boolean }; parameters: { k?: number; alpha?: number }; color: { log: boolean; alternative: boolean } }
export interface SessionData {
  schemaVersion: 1; kind: 'dsm-session'; title: string; metadata: ArtifactMetadata;
  input: MatrixData; source: SourceTable; runs: RunResult[]; views: Record<string, ViewHistory>;
  selectedRunId: string; settings: SessionSettings;
}
function fail(message: string): never { throw new Error(`セッション検証: ${message}`); }
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('オブジェクトの型が不正です。'); return value as Record<string, unknown>; }
function string(value: unknown, max = 1000): string { if (typeof value !== 'string' || value.length > max) fail('文字列の型または長さが不正です。'); return value; }
function integer(value: unknown, min: number, max: number): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail('整数の範囲が不正です。'); return value; }
function finite(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('非負有限数が必要です。'); return value; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail('真偽値の型が不正です。'); return value; }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) fail('配列の型または上限が不正です。'); return value; }
function safeTree(value: unknown, depth = 0, counter = { n: 0 }): void {
  if (depth > 32 || ++counter.n > 8_000_000) fail('入れ子またはデータ量が上限を超えました。');
  if (value instanceof Float64Array) return;
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('非有限数は保存できません。'); return; }
  if (typeof value !== 'object') fail('JSONで表現できない値があります。');
  for (const [key, item] of Object.entries(value as object)) { if (['__proto__','prototype','constructor'].includes(key)) fail('予約キーは使用できません。'); safeTree(item, depth + 1, counter); }
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
}
function equal(a: unknown, b: unknown, name: string) { if (canonical(a) !== canonical(b)) fail(`${name}が再計算結果と一致しません。`); }
function permutation(value: unknown, n: number): number[] { const a = array(value,n).map(v => integer(v,0,n-1)); assertPermutation(a,n); return a; }
function importOptions(value: unknown): ImportOptions {
  const raw = obj(value), result = { ...defaultOptions };
  for (const key of ['labels','symbols','blanks','diagonalBlanks','cachedFormula','reorderColumns'] as const) result[key] = bool(raw[key]);
  if (typeof raw['convention']!=='string' || typeof raw['encoding']!=='string' || typeof raw['delimiter']!=='string' || !['row-depends-on-column','row-supplies-column'].includes(String(raw['convention'])) || !['utf-8','shift_jis'].includes(String(raw['encoding'])) || !['',',','\t',';'].includes(String(raw['delimiter']))) fail('取込設定が不正です。');
  result.convention = raw['convention'] as ImportOptions['convention']; result.encoding = raw['encoding'] as ImportOptions['encoding']; result.delimiter = raw['delimiter'] as ImportOptions['delimiter']; result.sheet = string(raw['sheet']); result.range = string(raw['range']);
  return result;
}
function settings(value: unknown, n: number): SessionSettings {
  const raw = obj(value), algorithmId = string(raw['algorithmId']), plugin = algorithms.find(a => a.id === algorithmId);
  if (!plugin) fail('未知の手法です。');
  const options = obj(raw['options']), parameters = obj(raw['parameters']), color = obj(raw['color']);
  const result: SessionSettings = { algorithmId, options: { threshold: finite(options['threshold']), binary: bool(options['binary']) }, parameters: {}, color: { log: bool(color['log']), alternative: bool(color['alternative']) } };
  if (plugin.mode === 'structure') { const alpha = finite(parameters['alpha']); if (alpha === 0 || alpha > 3) fail('αの範囲が不正です。'); result.parameters.alpha = alpha; if (algorithmId === 'hierarchical-average-v1') result.parameters.k = integer(parameters['k'],1,n); }
  return result;
}
function metadata(value: unknown): ArtifactMetadata {
  const raw = obj(value); const result = { createdAt: string(raw['createdAt']), timeZone: string(raw['timeZone']), appVersion: string(raw['appVersion']), appCommit: string(raw['appCommit']), userAgent: string(raw['userAgent'],4000) };
  if (!Number.isFinite(Date.parse(result.createdAt))) fail('作成日時が不正です。');
  try { new Intl.DateTimeFormat('en',{ timeZone: result.timeZone }).format(); } catch { fail('タイムゾーンが不正です。'); }
  return result;
}
/** Rebuild from the source cells and rerun registered deterministic algorithms before accepting a session. */
export async function validateSession(value: unknown): Promise<SessionData> {
  safeTree(value); const raw = obj(value);
  if (raw['schemaVersion'] !== 1 || raw['kind'] !== 'dsm-session') fail('未知のスキーマです。');
  const m = obj(raw['input']), n = integer(m['n'],1,500), revision = integer(m['revision'],1,Number.MAX_SAFE_INTEGER);
  if (m['schemaVersion'] !== 1 || m['convention'] !== 'row-depends-on-column') fail('行列の版・方向が不正です。');
  const vals = m['values'] instanceof Float64Array ? Array.from(m['values']) : array(m['values'],n*n);
  if (vals.length !== n*n) fail('行列のサイズが不正です。');
  const elements = array(m['elements'],n).map((v,i) => { const e=obj(v); if (e['id'] !== `e${String(i+1).padStart(6,'0')}` || e['originalIndex'] !== i) fail('要素IDが不正です。'); const label=string(e['label'],200); if (!label || label.trim()!==label) fail('ラベルが不正です。'); return { id:e['id'] as string,label,originalIndex:i }; });
  if (elements.length !== n) fail('要素数が一致しません。');
  const p=obj(m['provenance']), sourceName=string(p['sourceName']), sourceSha256=string(p['sourceSha256']); if(!/^[a-f0-9]{64}$/i.test(sourceSha256)) fail('原ファイルハッシュが不正です。');
  const inputOptions = importOptions(p['importOptions']);
  const st=obj(raw['source']);
  const source: SourceTable = { rowOffset:integer(st['rowOffset'],0,1048575), colOffset:integer(st['colOffset'],0,16383), rows:array(st['rows'],501).map(row=>array(row,501).map(v=>{ const c=obj(v); const type=string(c['type'],10), value=c['value']; if(!['n','s','z'].includes(type) || type==='n'&&typeof value!=='number' || type==='s'&&typeof value!=='string' || type==='z'&&value!==null)fail('原セルの型が不正です。'); if(value!==null && !['string','number','boolean'].includes(typeof value)) fail('原セル値が不正です。'); if(typeof value==='string')string(value,1_048_576); return { type,value:value as string|number|boolean|null,...(c['formula']!==undefined?{formula:string(c['formula'],1_048_576)}:{}) }; })), ...(st['sheet']!==undefined?{sheet:string(st['sheet'])}:{}), ...(st['range']!==undefined?{range:string(st['range'])}:{}), ...(st['detectedDelimiter']!==undefined?{detectedDelimiter:string(st['detectedDelimiter'],1)}:{}) };
  if(source.rowOffset+source.rows.length>1048576 || source.colOffset+(source.rows[0]?.length??0)>16384)fail('原セル範囲が上限を超えています。');
  if(source.range){const first=coordinate(source.rowOffset,source.colOffset),last=coordinate(source.rowOffset+source.rows.length-1,source.colOffset+(source.rows[0]?.length??0)-1);equal(source.range,first===last?first:first+':'+last,'原セル範囲');}
  if(source.detectedDelimiter!==undefined&&![',','\t',';'].includes(source.detectedDelimiter))fail('CSV区切りが不正です。');
  const rebuilt=await validateTable(source,inputOptions,sourceName,sourceSha256,revision);
  if (!rebuilt.matrix) fail('原セル表から有効な行列を再現できません。');
  const input: MatrixData={...rebuilt.matrix,values:new Float64Array(vals.map(finite)),elements};
  equal(canonicalAnalysisInput(input),canonicalAnalysisInput(rebuilt.matrix),'原セル表と正規化行列');
  equal(p['transformations'],rebuilt.matrix.provenance.transformations,'取込変換履歴');
  if (p['sheet']!==rebuilt.matrix.provenance.sheet || p['range']!==rebuilt.matrix.provenance.range) fail('取込範囲が一致しません。');
  const runs: RunResult[]=[], ids=new Set<string>(), cache=new Map();
  for (const value of array(raw['runs'],100)) {
    const r=obj(value), runId=string(r['runId'],100);
    if (!/^[a-zA-Z0-9_-]+$/.test(runId) || ids.has(runId)) fail('結果IDが重複または不正です。'); ids.add(runId);
    permutation(r['order'],n);
    const algorithm=obj(r['algorithm']), algorithmId=string(algorithm['id']);
    const plugin=algorithms.find(a=>a.id===algorithmId); if (!plugin || algorithm['version']!==plugin.version || r['status']!=='completed' || r['dataRevision']!==revision) fail('結果の版・状態・revisionが不正です。');
    const condition=settings({algorithmId,parameters:r['parameters'],options:r['options'],color:{log:false,alternative:false}},n);
    const fresh=await runAnalysis(input,algorithmId,condition.parameters,condition.options,runId,undefined,cache);
    for(const key of ['inputHash','mode','parameters','options','order','membership','sccMembership','bandByElement','scc','hierarchy','preprocessing','metricVersions','warnings','stopReason'] as const) equal(r[key],fresh[key],key);
    const actualMetrics=obj(r['metrics']);
    if (Object.keys(actualMetrics).length!==Object.keys(fresh.metrics).length) fail('指標の件数が不正です。');
    for(const [key,expected] of Object.entries(fresh.metrics)) { const actual=actualMetrics[key]; if(expected===null ? actual!==null : typeof actual!=='number' || !Number.isFinite(actual) || Math.abs(actual-expected)>1e-9*Math.max(1,Math.abs(actual),Math.abs(expected))) fail(`指標${key}が一致しません。`); }
    runs.push({...fresh,elapsedMs:finite(r['elapsedMs']),iterations:integer(r['iterations'],0,Number.MAX_SAFE_INTEGER),evaluations:integer(r['evaluations'],0,Number.MAX_SAFE_INTEGER),stopReason:string(r['stopReason']),warnings:array(r['warnings'],100).map(v=>string(v,10000)),...(r['cacheHit']!==undefined?{cacheHit:bool(r['cacheHit'])}:{}),...(r['environment']!==undefined?{environment:metadata(r['environment'])}:{})});
  }
  const views: Record<string,ViewHistory>={}, savedViews=obj(raw['views']);
  if(Object.keys(savedViews).some(id=>!ids.has(id)))fail('対応しないビューがあります。');
  for(const run of runs) { const h=obj(savedViews[run.runId]); views[run.runId]={order:permutation(h['order'],n),past:array(h['past'],100).map(v=>permutation(v,n)),future:array(h['future'],100).map(v=>permutation(v,n))}; if(views[run.runId]!.past.length+views[run.runId]!.future.length>100)fail('ビュー履歴が100件を超えています。'); }
  const selectedRunId=string(raw['selectedRunId'],100); if(runs.length ? !ids.has(selectedRunId) : selectedRunId!=='')fail('選択結果が不正です。');
  const savedSettings=settings(raw['settings'],n),selected=runs.find(r=>r.runId===selectedRunId);
  if(selected){equal(savedSettings.algorithmId,selected.algorithm.id,'保存設定の手法');equal(savedSettings.options,selected.options,'保存設定の前処理');equal(savedSettings.parameters,selected.parameters,'保存設定のパラメータ');}
  return {schemaVersion:1,kind:'dsm-session',title:string(raw['title'],200),metadata:metadata(raw['metadata']),input,source,runs,views,selectedRunId,settings:savedSettings};
}
export function serializeSession(session: SessionData): string {
  const text=JSON.stringify(session,(_key,value:unknown)=>value instanceof Float64Array?Array.from(value):value,2);
  if(new TextEncoder().encode(text).byteLength>SESSION_LIMIT)throw new Error('セッションJSONは64MiB以内にしてください。'); return text;
}
export async function parseSession(bytes: ArrayBuffer): Promise<SessionData> {
  if(bytes.byteLength>SESSION_LIMIT)throw new Error('セッションJSONは64MiB以内にしてください。');
  return validateSession(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown);
}
export function rebaseSession(session: SessionData, revision: number): SessionData { return {...session,input:{...session.input,revision},runs:session.runs.map(run=>({...run,dataRevision:revision}))}; }
export async function sessionInputHash(session: SessionData) { return analysisInputHash(session.input,session.settings.options); }
