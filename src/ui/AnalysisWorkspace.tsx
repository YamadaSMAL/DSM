import { SearchDiagnostics } from './SearchDiagnostics';
import { IgtaControls } from './IgtaControls';
import { virtualMatrix } from '../algorithms/tearing';
import { PLUS_ID, GIGTA_ID, isIgtaProfile } from '../algorithms/igtaProfile';
import { useEffect, useMemo, useRef, useState } from 'react';
import { identityOrder, preprocess, type AnalysisMode, type MatrixData } from '../domain';
import { algorithms, comparisonKey, compareResults, isRankable, normalizeParameters, objectiveValue } from '../algorithms/registry';
import { deriveSeeds } from '../algorithms/random';
import { batchStatistics } from '../algorithms/statistics';
import type { Parameters } from '../algorithms/types';
import { defaultK } from '../algorithms/hierarchical';
import { processViewMetrics } from '../algorithms/process';
import type { RunResult } from '../algorithms/types';
import { initialView, type ViewHistory } from '../state/views';
import { AnalysisClient, AnalysisStopped } from '../workers/analysisClient';
import type { AnalysisResponse } from '../workers/analysisProtocol';
import { MatrixCanvas } from './MatrixCanvas';
import { OrderEditor } from './OrderEditor';
import { ExportPanel } from './ExportPanel';
import { StepTitle, Tip } from './Tip';
import type { TabId } from './App';
import { artifactMetadata } from '../io/artifact';
import type { SessionData } from '../io/session';
import type { SourceTable } from '../io/types';
const metricLabels: Record<string, string> = {
  totalCost: 'TotalCost（探索目的）', mdl: 'MDL（探索目的）',
  coordinationCost: '調整コスト（共通評価）', totalWeight: '総重み', internalWeight: '内部重み', externalWeight: '外部重み', externalRatio: '外部比', clusterCount: 'クラスタ数', minClusterSize: '最小規模', maxClusterSize: '最大規模', meanClusterSize: '平均規模', alpha: 'α',
  feedbackWeight: 'フィードバック重み', feedbackCount: 'フィードバック件数', feedbackRatio: 'フィードバック比', interSccFeedbackWeight: 'SCC間フィードバック重み', sccCount: 'SCC数', maxSccSize: '最大SCC規模', cyclicBlockCount: '循環ブロック数', bandCount: 'Band数',
};
const metricTips: Record<string, string> = {
  totalCost: 'IGTA+が最小化する目的値。クラスタの内外にまたがる依存にコストを付けた合計で、小さいほど良い分け方です。',
  mdl: 'G-IGTAが最小化する記述長（MDL）。クラスタ構成を簡潔に表せるほど、また例外の依存が少ないほど小さくなります。',
  coordinationCost: '全手法で共通に使う評価値。クラスタをまたぐ依存や大きすぎるクラスタほどコストが増えます。小さいほど調整が少なく済みます。',
  totalWeight: '解析に使ったすべての依存の重みの合計。',
  internalWeight: 'クラスタの内側に収まった依存の重みの合計。大きいほど、まとまりが良いことを示します。',
  externalWeight: 'クラスタをまたぐ依存の重みの合計。小さいほど、グループ間の調整が少なくて済みます。',
  externalRatio: '外部重み ÷ 総重み。全要素を1つにまとめると0になるため、クラスタ数や規模と併せて見てください。',
  clusterCount: '分けられたグループ（クラスタ）の数。',
  minClusterSize: '最も小さいクラスタの要素数。', maxClusterSize: '最も大きいクラスタの要素数。', meanClusterSize: 'クラスタあたりの平均要素数。',
  alpha: '調整コストの計算で、クラスタの大きさに課したペナルティの強さ。',
  feedbackWeight: '工程の並びに逆らう依存（後の作業から前の作業へ戻る＝手戻り）の重み合計。小さいほど良い順序です。',
  feedbackCount: '手戻りとなる依存の件数。', feedbackRatio: 'フィードバック重み ÷ 総重み。',
  interSccFeedbackWeight: '循環ブロック（SCC）どうしの間で生じる手戻り。0なら順序に矛盾がありません。',
  sccCount: 'SCC（強連結成分）＝互いに依存し合って循環している要素のまとまりの数。単独の要素も1つと数えます。',
  maxSccSize: '最も大きい循環ブロックの要素数。大きいほど、同時に調整すべき作業が多いことを示します。',
  cyclicBlockCount: '2要素以上が循環している（ぐるぐる依存し合う）ブロックの数。',
  bandCount: 'Band＝前の作業が終われば並行して着手できる可能性のある作業グループ。その段数です。',
};
function number(value: number | null | undefined) { return value === null || value === undefined ? '—（関係なし）' : value.toLocaleString('ja-JP', { maximumSignificantDigits: 8 }); }
const statistic=(value:number|null)=>value===null?'—（成功例なし）':number(value);
export function AnalysisWorkspace({ matrix, source, restored, tab = 'analysis', onTab, onResultCount }: { matrix: MatrixData | null; source?: SourceTable; restored?: SessionData | null; tab?: TabId; onTab?: (tab: TabId) => void; onResultCount?: (count: number) => void }) {
  const [mode, setMode] = useState<AnalysisMode>(restored?.runs.find(r=>r.runId===restored.selectedRunId)?.mode ?? (algorithms.find(a=>a.id===restored?.settings.algorithmId)?.mode ?? 'structure'));
  const [algorithm, setAlgorithm] = useState(restored?.settings.algorithmId ?? 'hierarchical-average-v1');
  const [threshold, setThreshold] = useState(String(restored?.settings.options.threshold ?? 0)), [binary, setBinary] = useState(restored?.settings.options.binary ?? false);
  const [k, setK] = useState(String(restored?.settings.parameters.k ?? defaultK(matrix?.n ?? 1))), [alpha, setAlpha] = useState(String(restored?.settings.parameters.alpha ?? 1));
  const [runs, setRuns] = useState<RunResult[]>(restored?.runs ?? []), [selectedId, setSelectedId] = useState(restored?.selectedRunId ?? '');
  const [views, setViews] = useState<Record<string, ViewHistory>>(restored?.views ?? {});
  const [seed,setSeed]=useState(String(restored?.settings.seed??restored?.runs.find(r=>r.runId===restored.selectedRunId)?.seed??20261116)),[repetitions,setRepetitions]=useState(restored?'1':'10');
  const [searchConfig,setSearchConfig]=useState(()=>({maxProposals:String(restored?.settings.parameters.maxProposals??100000),maxEvaluations:String(restored?.settings.parameters.maxEvaluations??100101),coolingInterval:String(restored?.settings.parameters.coolingInterval??1000),coolingRate:String(restored?.settings.parameters.coolingRate??.95),temperatureFloor:String(restored?.settings.parameters.temperatureFloor??1e-12),inflation:String(restored?.settings.parameters.inflation??2),maxIterations:String(restored?.settings.parameters.maxIterations??100)}));
  const [initialization,setInitialization]=useState<'separate'|'hierarchical'>(restored?.settings.parameters.initialization??'separate');
  const [gaConfig,setGaConfig]=useState(()=>({populationSize:String(restored?.settings.parameters.populationSize??50),generations:String(restored?.settings.parameters.generations??200),tournamentSize:String(restored?.settings.parameters.tournamentSize??3),eliteCount:String(restored?.settings.parameters.eliteCount??2),crossoverRate:String(restored?.settings.parameters.crossoverRate??.8),mutationRate:String(restored?.settings.parameters.mutationRate??1/(matrix?.n??1)),maxTears:String(restored?.settings.parameters.maxTears??Math.min(10000,Math.max(1,(matrix?.n??1)*((matrix?.n??1)-1))))}));
  const [constraintText,setConstraintText]=useState(restored?.settings.parameters.constraints?JSON.stringify(restored.settings.parameters.constraints,null,2):'');
  const profileDefaults=(p:Parameters|undefined)=>({costExponent:String(p?.costExponent??1),secondBidDenominator:String(p?.secondBidDenominator??10),acceptDenominator:String(p?.acceptDenominator??10),maxProposals:String(p?.maxProposals??100000),clusterSlots:String(p?.clusterSlots??Math.min(14,matrix?.n??1)),populationSize:String(p?.populationSize??36),generations:String(p?.generations??36),maxEvaluations:String(p?.maxEvaluations??1332),mdlAlpha:String(p?.mdlAlpha??.1096),mdlBeta:String(p?.mdlBeta??.8071)});
  const [profileConfig,setProfileConfig]=useState(()=>profileDefaults(restored?.settings.parameters)),[packing,setPacking]=useState<'horizontal'|'vertical'>(restored?.settings.parameters.packing??'horizontal');
  const cancelBatch=useRef(false);
  const [colorOptions, setColorOptions] = useState(restored?.settings.color ?? { log: false, alternative: false });
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Extract<AnalysisResponse, { status: 'progress' }>['progress'] | null>(null);
  const client = useRef<AnalysisClient | null>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; client.current?.dispose(); }, []);
  useEffect(() => { onResultCount?.(runs.length); }, [runs.length, onResultCount]);
  const selected = runs.find(r => r.runId === selectedId), history = selected ? views[selected.runId] : undefined;
  const plugin = algorithms.find(a => a.id === algorithm)!;
  let parameters:Parameters={},validation='';
  try{
    if(!matrix)throw new Error('データを確定してください。');
    if(threshold.trim()===''||!Number.isFinite(Number(threshold))||Number(threshold)<0)throw new Error('閾値は非負有限数が必要です。');
    const fields:Parameters=mode==='structure'?{alpha:Number(alpha),k:Number(k)}:{};
    if(mode==='structure'&&alpha.trim()==='')throw new Error('αを指定してください。');
    if(algorithm==='hierarchical-average-v1'||algorithm==='sa-cluster-v1'&&initialization==='hierarchical'){if(k.trim()==='')throw new Error('kを指定してください。');}
    if(algorithm.startsWith('sa-')){for(const key of ['maxProposals','maxEvaluations','coolingInterval','coolingRate','temperatureFloor'] as const){if(!searchConfig[key].trim())throw new Error('探索条件を指定してください。');fields[key]=Number(searchConfig[key]);}if(algorithm==='sa-cluster-v1')fields.initialization=initialization;}
    if(algorithm==='mcl-exclusive-v1'){if(!searchConfig.inflation.trim()||!searchConfig.maxIterations.trim())throw new Error('MCL条件を指定してください。');fields.inflation=Number(searchConfig.inflation);fields.maxIterations=Number(searchConfig.maxIterations);}
    if(algorithm==='ga-cluster-v1')for(const key of ['populationSize','generations','tournamentSize','eliteCount','crossoverRate','mutationRate']as const){if(!gaConfig[key].trim())throw new Error('GA条件を指定してください。');fields[key]=Number(gaConfig[key]);}
    if(algorithm==='tearing-greedy-v1'){if(!gaConfig.maxTears.trim())throw new Error('提案上限を指定してください。');fields.maxTears=Number(gaConfig.maxTears);}
    if(constraintText.trim())fields.constraints=JSON.parse(constraintText);
    if(isIgtaProfile(algorithm)){for(const key of (algorithm===PLUS_ID?['costExponent','secondBidDenominator','acceptDenominator','maxProposals']:['clusterSlots','populationSize','generations','maxEvaluations','mdlAlpha','mdlBeta']) as (keyof typeof profileConfig)[]){if(!profileConfig[key].trim())throw new Error('参照プロファイルの条件を明示してください。');fields[key]=Number(profileConfig[key]);}if(algorithm===GIGTA_ID)fields.packing=packing;}
    parameters=normalizeParameters(matrix.n,algorithm,fields);
    if(matrix.n>plugin.limits.maxN)throw new Error(`${plugin.label}の上限は${plugin.limits.maxN}要素です。`);
    const count=plugin.capabilities.seeded?Number(repetitions):1;
    if(plugin.capabilities.seeded){if(!seed.trim()||!repetitions.trim())throw new Error('seedと反復数を指定してください。');deriveSeeds(Number(seed),count);}
    if(runs.length+count>100)throw new Error('結果は100件までです。反復数を減らすか結果を削除してください。');
  }catch(error){validation=error instanceof Error?error.message:String(error);}
  const valid=!!matrix&&!validation;
  async function execute() {
    if(!matrix||!valid||busy)return;
    const token=++generation.current,seeds=plugin.capabilities.seeded?deriveSeeds(Number(seed),Number(repetitions)):[undefined],batchId=crypto.randomUUID(),rootSeed=Number(seed),fixedParameters={...parameters},fixedOptions={threshold:Number(threshold),binary},algorithmId=algorithm;
    setBusy(true);setStatus('解析中');setProgress(null);cancelBatch.current=false;client.current??=new AnalysisClient();let recorded=0,provisional=0;
    try{
      for(let index=0;index<seeds.length;index++){
        if(cancelBatch.current)break;
        setStatus(`解析中 ${index+1}/${seeds.length}`);
        const trialSeed=seeds[index],result=await client.current.run(matrix,algorithmId,{...fixedParameters,...(trialSeed!==undefined?{seed:trialSeed}:{})},fixedOptions,response=>{if(token===generation.current)setProgress(response.progress);});
        if(token!==generation.current)return;
        const saved:RunResult=trialSeed!==undefined?{...result,batch:{id:batchId,rootSeed,index,count:seeds.length,seeds:seeds as number[]}}:result;
        setRuns(previous=>[...previous,saved]);setViews(previous=>({...previous,[saved.runId]:initialView(saved.order)}));if(recorded===0)setSelectedId(saved.runId);recorded++;if(result.status!=='completed'||result.converged===false)provisional++;
        if(result.status==='cancelled'){cancelBatch.current=true;break;}
      }
      // 取消時は解析タブに留まる（結果タブの大きな行列の再描画で取消の反映を遅らせない）。結果は保持され、結果タブから参照できる。
      if(token===generation.current&&recorded>0&&!cancelBatch.current)onTab?.('results');setStatus(cancelBatch.current?`cancelled · ${recorded}/${seeds.length}結果を保持しました。`:provisional?`limit-reached · ${recorded}結果を保存（${provisional}件は暫定・未収束）`:`completed · ${recorded}結果の実行終了`);
    }catch(error){if(token===generation.current)setStatus(`${error instanceof AnalysisStopped?error.status:'failed'} · ${error instanceof Error?error.message:String(error)} / ${recorded}結果を保持`);}
    finally{if(token===generation.current)setBusy(false);}
  }
  function restoreConditions(run:RunResult){
    onTab?.('analysis');
    setProfileConfig(profileDefaults(run.parameters));setPacking(run.parameters.packing??'horizontal');
    setMode(run.mode);setAlgorithm(run.algorithm.id);setThreshold(String(run.options.threshold));setBinary(run.options.binary);setAlpha(String(run.parameters.alpha??1));setK(String(run.parameters.k??defaultK(matrix?.n??1)));setSeed(String(run.seed??20261116));setRepetitions('1');setInitialization(run.parameters.initialization??'separate');
    setConstraintText(run.parameters.constraints?JSON.stringify(run.parameters.constraints,null,2):'');
    setGaConfig({populationSize:String(run.parameters.populationSize??50),generations:String(run.parameters.generations??200),tournamentSize:String(run.parameters.tournamentSize??3),eliteCount:String(run.parameters.eliteCount??2),crossoverRate:String(run.parameters.crossoverRate??.8),mutationRate:String(run.parameters.mutationRate??1/(matrix?.n??1)),maxTears:String(run.parameters.maxTears??Math.min(10000,Math.max(1,(matrix?.n??1)*((matrix?.n??1)-1))))});
    setSearchConfig({maxProposals:String(run.parameters.maxProposals??100000),maxEvaluations:String(run.parameters.maxEvaluations??100101),coolingInterval:String(run.parameters.coolingInterval??1000),coolingRate:String(run.parameters.coolingRate??.95),temperatureFloor:String(run.parameters.temperatureFloor??1e-12),inflation:String(run.parameters.inflation??2),maxIterations:String(run.parameters.maxIterations??100)});
  }
  const field=(key:keyof typeof searchConfig,label:string,tip?:string)=><span className="with-tip" key={key}><label className="field">{label}<input aria-label={label} type="number" step="any" value={searchConfig[key]} onChange={e=>setSearchConfig(previous=>({...previous,[key]:e.target.value}))}/></label>{tip&&<Tip text={tip}/>}</span>;
  const viewMetrics = useMemo(() => matrix && selected?.scc && history ? processViewMetrics(preprocess(matrix, selected.options).directed, history.order, selected.scc) : null, [matrix, selected, history]);
  const comparable = selected ? runs.filter(r => isRankable(r)&&comparisonKey(r) === comparisonKey(selected)).sort(compareResults) : [];
  const changed=selected&&(mode!==selected.mode||algorithm!==selected.algorithm.id||JSON.stringify(parameters)!==JSON.stringify(selected.parameters)||Number(threshold)!==selected.options.threshold||binary!==selected.options.binary||plugin.capabilities.seeded&&Number(seed)!==selected.seed);
  const batches=batchStatistics(runs);
  const sharedMax = useMemo(() => matrix?.values.reduce((a,b) => Math.max(a,b), 0) ?? 0, [matrix]);
  function capture(): SessionData | null {
    if(!matrix || !source)return null;
    const selectedRun=runs.find(r=>r.runId===selectedId);
    if(!selectedRun&&!valid)return null;
    const chosen=selectedRun?.parameters??(valid?parameters:normalizeParameters(matrix.n,algorithm,{}));
    return {schemaVersion:1,kind:'dsm-session',title:restored?.title??'DSM解析レポート',metadata:restored?.metadata??artifactMetadata(),input:matrix,source,runs,views,selectedRunId:selectedId,settings:{algorithmId:selectedRun?.algorithm.id??algorithm,options:selectedRun?.options??{threshold:valid?Number(threshold):0,binary},parameters:chosen,color:colorOptions,...(selectedRun?.seed!==undefined?{seed:selectedRun.seed}:!selectedRun&&plugin.capabilities.seeded?{seed:valid?Number(seed):0}:{})}};
  }
  const statusTone=busy?'running':/^completed/.test(status)?'ok':/^(cancelled|limit-reached)/.test(status)?'warn':/^(failed|error|timeout)/.test(status)?'error':'';
  const algorithmNote=algorithm==='hierarchical-average-v1'?'Sの直接結合を平均連結で分割します。最適k・大域最適は保証せず、全併合履歴を再利用します。最悪O(n³)。':algorithm==='tearing-greedy-v1'?'元Dを保持し、循環内の最小重み依存を一つずつ仮定します。仮想順序と元指標を別に表示します。':mode==='process'?'列 → 行の有向Dを使います。SCC間の先行順は固定、Bandは同時実行を保証しません。':'構造指標は対角を除外したmean Sで評価します。MCLの自己ループは計算用で、指標に加えません。';
  return <section className="analysis-workspace" aria-label="解析ワークスペース">
    <div role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis" hidden={tab !== 'analysis'}>
    <section className="panel"><StepTitle no="03" tip="データの見方（構造／工程）と解析手法を選び、「解析を実行」を押します。迷ったら既定値のままで実行して構いません。">解析条件</StepTitle>
      {!matrix && <p className="empty">データを確定すると解析できます。</p>}
      <div className="segmented" role="radiogroup" aria-label="解析モード">
        <label className={mode==='structure'?'on':''}><input type="radio" name="mode" checked={mode === 'structure'} onChange={() => { setMode('structure'); setAlgorithm('hierarchical-average-v1'); }} />構造 · 部品・組織のまとまり</label>
        <label className={mode==='process'?'on':''}><input type="radio" name="mode" checked={mode === 'process'} onChange={() => { setMode('process'); setAlgorithm('scc-tarjan-kahn-v1'); }} />工程 · タスクの依存と順序</label>
        <Tip text={<><b>構造</b>: 互いによく依存し合う要素をグループ（クラスタ）にまとめます。部品のモジュール化やチーム編成の検討向け。<br /><b>工程</b>: 依存の向きから作業の順番を求め、手戻り（フィードバック）が少ない並びを探します。</>} />
      </div>
      <div className="fields">
        <span className="with-tip"><label className="field wide">手法<select aria-label="解析手法" value={algorithm} onChange={e => setAlgorithm(e.target.value)}>{algorithms.filter(a => a.mode === mode).map(a => <option key={a.id} value={a.id} disabled={!!constraintText.trim()&&!a.capabilities.constraints.length}>{a.label}</option>)}</select></label><Tip text={algorithmNote} /></span>
        <span className="with-tip"><label className="field">解析閾値 τ<input aria-label="実行する解析閾値" type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} /></label><Tip text="この値以下の弱い依存を無視して解析します。0ならすべての依存を使います。" /></span>
        {mode === 'structure' && <><span className="with-tip"><label className="field">α<input aria-label="調整コストのα" type="number" min="0.01" max="3" step="any" value={alpha} onChange={e => setAlpha(e.target.value)} /></label><Tip text="調整コストでクラスタの大きさに課すペナルティの強さ（0.01〜3）。大きいほど大きなクラスタが不利になり、細かく分かれやすくなります。" /></span>{(algorithm === 'hierarchical-average-v1'||algorithm==='sa-cluster-v1'&&initialization==='hierarchical') && <span className="with-tip"><label className="field">クラスタ数 k<input aria-label="クラスタ数 k" type="number" min="1" max={matrix?.n ?? 500} step="1" value={k} onChange={e => setK(e.target.value)} /></label><Tip text="要素をいくつのグループに分けるか。" /></span>}</>}
      </div>
      <div className="controls"><span className="with-tip"><label className="check"><input type="checkbox" checked={binary} onChange={e => setBinary(e.target.checked)} />解析を二値化（閾値の後）</label><Tip text="閾値を超えた依存をすべて「1」として扱い、重みの大小を無視します。" /></span></div>
      <p className="meta">{plugin.baseline?'比較基準（最適化手法ではありません）':plugin.label} · {plugin.id} / {plugin.version} · 上限{plugin.limits.maxN}要素 · {plugin.capabilities.seeded?'seed付き探索':'決定的手法（seed反復不要）'}</p>
      {algorithm.startsWith('sa-')&&<details className="disclosure" open><summary>焼きなましの探索条件</summary><div className="fields"><Tip text="焼きなまし法（SA）は、ランダムな入れ替えを繰り返し、ときどき悪い案も受け入れて局所的な行き止まりを避ける探索法です。評価数は初期解1回と温度調査100近傍を含みます。無効提案も提案数に数えます。固定予算を完走した最良解を保存し、大域最適は保証しません。" />{field('maxProposals','最大提案数','試す入れ替え案の上限数。多いほど丁寧に探しますが時間がかかります。')}{field('maxEvaluations','最大評価数','目的関数を計算する回数の上限。')}{field('coolingInterval','冷却区間','何回の提案ごとに温度を下げるか。')}{field('coolingRate','冷却率','温度を下げる倍率（0〜1）。1に近いほどゆっくり冷やし、悪い案も受け入れながら広く探索します。')}{field('temperatureFloor','温度下限','温度がこの値まで下がると探索を終えます。')}{algorithm==='sa-cluster-v1'&&<label className="field">初期所属<select aria-label="初期所属" value={initialization} onChange={e=>setInitialization(e.target.value as 'separate'|'hierarchical')}><option value="separate">全要素別クラスタ</option><option value="hierarchical">階層法のkクラスタ</option></select></label>}</div></details>}
      {algorithm==='mcl-exclusive-v1'&&<div className="fields">{field('inflation','MCL inflation','クラスタの細かさを決める値。大きいほど小さなクラスタに分かれます。')}{field('maxIterations','MCL最大反復','収束しない場合に打ち切る反復回数。')}<Tip text="上限200要素。prune=1e-8、差1e-6未満が5回で収束。アプリ独自の排他的抽出です。未収束は通常ランキングから除外します。" /></div>}
      {isIgtaProfile(algorithm)&&<IgtaControls algorithm={algorithm} config={profileConfig} change={(key,value)=>setProfileConfig(previous=>({...previous,[key]:value}))} packing={packing} setPacking={setPacking}/>}
      {algorithm==='ga-cluster-v1'&&<details className="disclosure" open><summary>汎用GAの条件</summary><div className="fields"><Tip text="遺伝的アルゴリズム（GA）は、複数の解を「交叉」「突然変異」で世代ごとに改良していく探索法です。初出順の所属番号で一様交叉するため、番号対応が結果へ影響します。IGTA系とは独立した汎用GAです。" />{(['populationSize','generations','tournamentSize','eliteCount','crossoverRate','mutationRate'] as const).map(key=><span className="with-tip" key={key}><label className="field">{({populationSize:'個体数',generations:'最大世代',tournamentSize:'トーナメント数',eliteCount:'エリート数',crossoverRate:'交叉率',mutationRate:'突然変異率'})[key]}<input aria-label={key} type="number" step="any" value={gaConfig[key]} onChange={e=>setGaConfig({...gaConfig,[key]:e.target.value})}/></label><Tip text={({populationSize:'同時に育てる解の数。',generations:'世代交代を繰り返す回数。',tournamentSize:'親を選ぶときに比べる候補の数。大きいほど良い解が選ばれやすくなります。',eliteCount:'そのまま次の世代へ残す最良解の数。',crossoverRate:'2つの親の解を組み合わせる確率（0〜1）。',mutationRate:'要素の所属をランダムに変える確率（0〜1）。'})[key]} /></span>)}</div></details>}
      {algorithm==='tearing-greedy-v1'&&<div className="fields"><span className="with-tip"><label className="field">候補辺の上限<input aria-label="候補辺の上限" type="number" value={gaConfig.maxTears} onChange={e=>setGaConfig({...gaConfig,maxTears:e.target.value})}/></label><Tip text="循環を断ち切るために「仮に無視する依存（Tearing）」として提案する件数の上限。" /></span></div>}
      <details className="disclosure"><summary>構造制約（対応: 汎用GA）</summary><p className="hint">元indexは0始まりです。mustLink / cannotLinkはペアの配列、minClusters / maxClusters / maxClusterSizeは整数です。空欄は制約なし。未対応手法では実行を拒否します。</p><p className="hint">例: <code>{JSON.stringify({mustLink:[[0,1]],cannotLink:[[1,2]],minClusters:2,maxClusters:3,maxClusterSize:3})}</code></p><label className="field wide">制約JSON<textarea aria-label="構造制約JSON" rows={5} value={constraintText} onChange={e=>setConstraintText(e.target.value)}/></label><p className="muted">対応制約: {plugin.capabilities.constraints.join(', ')||'なし'}。制約付きと制約なしは別条件で比較します。</p></details>
      {plugin.capabilities.seeded&&<div className="seed-box"><div className="fields"><span className="with-tip"><label className="field">root seed<input aria-label="root seed" type="number" min="0" max="4294967295" value={seed} onChange={e=>setSeed(e.target.value)}/></label><Tip text={<>乱数の種です。同じseedと条件なら、同じ結果を再現できます。<br />各試行のseedは root + index × 0x9e3779b9（32bit）で導出し、逐次処理します。PRNG: mulberry32-v1。</>} /></span><button className="ghost" onClick={()=>setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]))}>自動seedを生成</button><span className="with-tip"><label className="field">seed反復数<input aria-label="seed反復数" type="number" min="1" max="100" value={repetitions} onChange={e=>setRepetitions(e.target.value)}/></label><Tip text="異なるseedで何回試すか。複数回試すと、結果のばらつきや安定性を確認できます。" /></span></div><details className="disclosure small"><summary>実行予定seed</summary><p className="hash">{valid?deriveSeeds(Number(seed),Number(repetitions)).join(', '):'seed・反復数を確認してください。'}</p></details></div>}
      <div className="actions run-bar"><button className="primary large" disabled={!valid || busy} onClick={() => void execute()}>解析を実行</button><button className="ghost" disabled={!busy} onClick={() => { setStatus('取消中…');cancelBatch.current=true; client.current?.cancel(); }}>解析を取消</button>
        <p role="status" data-testid="analysis-status" className={`status-pill ${statusTone}`}>{status}</p></div>
      {matrix && !valid && <p role="alert" className="callout danger">{validation}</p>}
      {busy && progress && <p className="progress-line"><span className="spinner" aria-hidden="true" />段階: {progress.phase} / 反復: {progress.iterations} / 評価: {progress.evaluations} / 経過: {progress.elapsedMs.toFixed(0)}ms / 最良値: {progress.bestValue===undefined?'—':number(progress.bestValue)}{progress.bestCount===undefined?'':` / 件数 ${progress.bestCount}`}</p>}
    </section>
    {matrix && !selected && <MatrixCanvas matrix={matrix} options={{ threshold: Number.isFinite(Number(threshold)) && Number(threshold) >= 0 ? Number(threshold) : 0, binary }} />}
    </div>
    <div role="tabpanel" id="panel-results" aria-labelledby="tab-results" hidden={tab !== 'results'}>
    {!!runs.length && <section className="panel"><StepTitle no="04" tip="実行した結果の一覧です。ラジオボタンで選ぶと、下に詳細とDSMが表示されます。同じ入力ハッシュ・モード・前処理・指標版・共通α・探索目的と係数の結果どうしだけに順位を付けます。">解析結果（暫定を含む）</StepTitle>
      <div className="table-scroll"><table aria-label="解析結果一覧"><thead><tr><th>選択</th><th>手法 / 条件</th><th>状態 / 時間</th><th>目的値</th><th>同条件順位</th><th>操作</th></tr></thead><tbody>{runs.map((run, index) => <tr key={run.runId} className={selectedId === run.runId ? 'selected' : ''}><td><input type="radio" name="run" aria-label={`結果${index + 1}を選択`} checked={selectedId === run.runId} onChange={() => setSelectedId(run.runId)} /></td><td><strong>{run.mode === 'structure' ? '構造' : '工程'} · {algorithms.find(a => a.id === run.algorithm.id)?.label}</strong><br /><span className="muted">τ={run.options.threshold} / 二値化={String(run.options.binary)}</span> <details className="inline"><summary>パラメータ</summary><p className="hash">{JSON.stringify(run.parameters)}</p></details></td><td><span className={`tag ${run.status==='completed'&&run.converged!==false?'ok':'warn'}`}>{run.status}{run.converged===false?' / 未収束':''}</span><br /><span className="muted">seed={run.seed??'—'}<br />{run.elapsedMs.toFixed(1)}ms</span></td><td className="num">{number(objectiveValue(run))} <span className="muted">{run.objective?.name??''}</span></td><td>{comparable.some(r => r.runId === run.runId) ? 1 + comparable.filter(r => compareResults(r, run) < 0).length : run.tearing?'除外（仮定提案）':!isRankable(run)?'除外（暫定・未収束）':'比較対象外（条件差）'}</td><td><button className="ghost small danger-text" aria-label={`結果${index + 1}を削除`} onClick={() => { setRuns(previous => previous.filter(r => r.runId !== run.runId)); setViews(previous => { const next = { ...previous }; delete next[run.runId]; return next; }); if (selectedId === run.runId) setSelectedId(runs.find(r => r.runId !== run.runId)?.runId ?? ''); }}>削除</button></td></tr>)}</tbody></table></div>
    </section>}
    {!!batches.length&&<section className="panel"><StepTitle tip="同一batch・手法・入力・評価条件の記録済み成功例のみ集計します。未収束・暫定結果、未実行・削除した試行を統計へ補いません。標準偏差は母標準偏差です。">複数seedの集計</StepTitle><div className="table-scroll"><table aria-label="複数seedの集計"><thead><tr><th>手法 / 条件</th><th>root / 成功数</th><th>最良</th><th>中央値</th><th>最悪</th><th>標準偏差</th><th>試行seed</th></tr></thead><tbody>{batches.map(b=><tr key={b.batch.id}><td>{b.algorithmId} / {b.objectiveName}<br/><span className="muted">τ={b.options.threshold}</span><details className="inline"><summary>パラメータ</summary><p className="hash">{JSON.stringify(b.parameters)}</p></details></td><td>{b.batch.rootSeed}<br/>{b.successful}/{b.batch.count}成功 / {b.recorded}記録</td><td className="num">{statistic(b.best)}</td><td className="num">{statistic(b.median)}</td><td className="num">{statistic(b.worst)}</td><td className="num">{statistic(b.standardDeviation)}</td><td className="hash">{deriveSeeds(b.batch.rootSeed,b.batch.count).join(', ')}</td></tr>)}</tbody></table></div></section>}
    {matrix && selected && history && <>
      <section className="panel" aria-label="選択結果の情報"><div className="result-head"><StepTitle>選択結果 · {selected.mode === 'structure' ? '構造クラスタ' : 'SCC・工程順序'}</StepTitle><span className="with-tip"><button className="ghost" onClick={()=>restoreConditions(selected)}>この結果の条件を設定へ</button><Tip text="この結果を出したときの解析条件を、上の「解析条件」へ読み戻します。条件を少し変えて再実行したいときに使います。" /></span></div>
      {changed && <p className="callout warning" role="status">設定が変更されています。以下は保存済みの解析条件による結果です。新しい条件は再実行してください。</p>}
      {selected.warnings.map(warning => <p className="callout warning" key={warning}>{warning}</p>)}
      <div className="metric-grid" aria-label="解析結果の指標">{Object.entries(selected.metrics).map(([key, value]) => <div key={key} data-metric={key}><span>{metricLabels[key] ?? key}{metricTips[key] && <Tip label={`${metricLabels[key] ?? key}の説明`} text={metricTips[key]} />}</span><strong>{number(value)}</strong></div>)}</div>
      {selected.objective&&<p className="meta">探索目的: {selected.objective.name} = {number(selected.objective.value)} / {selected.objective.version} / {JSON.stringify(selected.objective.conditions)}。共通評価の調整コストとは別の値です。</p>}
      <p className="meta">指標版: {Object.values(selected.metricVersions).join(', ')} / {selected.cacheHit ? '併合履歴を再利用' : '新規計算'}</p>
      <details className="disclosure small"><summary>実行条件の詳細</summary><p className="meta">{selected.algorithm.id} / {selected.algorithm.version} · revision {selected.dataRevision} · {selected.status} / {selected.stopReason}<br />seed={selected.seed??'—'} / PRNG={selected.prngVersion??'—'} / 収束={String(selected.converged??'未定義')}<br />τ={selected.options.threshold} / 二値化={String(selected.options.binary)} / {JSON.stringify(selected.parameters)}<br />反復={selected.iterations} / 評価={selected.evaluations} / 経過={selected.elapsedMs.toFixed(1)}ms</p><p className="hash">入力ハッシュ: {selected.inputHash}</p></details>
      <details className="disclosure small"><summary>前処理履歴</summary><ul className="plain-list">{selected.preprocessing.map((t,i) => <li key={i}>{t.kind}: {t.affectedCells}セル / {JSON.stringify(t.params)}</li>)}</ul></details>
      {selected.hierarchy && <details className="disclosure small"><summary>併合履歴（樹形図データ）{selected.hierarchy.merges.length}件</summary><div className="table-scroll"><table><thead><tr><th>ノード</th><th>左</th><th>右</th><th>距離</th><th>規模</th></tr></thead><tbody>{selected.hierarchy.merges.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.left}</td><td>{m.right}</td><td>{m.distance}</td><td>{m.size}</td></tr>)}</tbody></table></div><p className="muted">葉のindexは0始まり、併合ノードはnから始まります。</p></details>}
      {selected.trace&&<details className="disclosure small"><summary>探索・初期解の記録</summary><p className="hash">{JSON.stringify(selected.trace)}</p><p className="hash">{JSON.stringify(selected.initialState)}</p></details>}
      {selected.tearing&&<section aria-label="Tearing提案" className="sub-section"><h3>循環を切るための仮定提案 <Tip text="循環（互いに依存し合う関係）を解くために、「仮にこの依存を後回しにする」候補を示します。元の依存関係は変更しません。実際の仮定コストや最小辺集合を保証しません。" /></h3><p>候補重み合計 {number(selected.tearing.totalWeight)} / 仮想DAG: {String(selected.tearing.acyclic)}</p><p>元Dのフィードバック重み {number(selected.metrics['feedbackWeight'])} / 仮想D {number(selected.tearing.virtualMetrics.feedbackWeight)}。仮想順序: {selected.tearing.virtualOrder.map(i=>matrix.elements[i]!.label).join(' → ')}</p><div className="table-scroll"><table aria-label="仮定する依存候補"><thead><tr><th>供給元（列）</th><th>受取先（行）</th><th>重み</th></tr></thead><tbody>{selected.tearing.edges.map(e=><tr key={e.from+':'+e.to}><td>{matrix.elements[e.from]!.id} / {matrix.elements[e.from]!.label}</td><td>{matrix.elements[e.to]!.id} / {matrix.elements[e.to]!.label}</td><td>{number(e.weight)}</td></tr>)}</tbody></table></div></section>}
      </section>
      <div className="comparison-canvases"><MatrixCanvas matrix={matrix} order={identityOrder(matrix.n)} options={selected.options} title="元DSM · 入力順" sharedMax={sharedMax} colorOptions={colorOptions} onColorChange={setColorOptions} />
      <MatrixCanvas key={selected.runId} matrix={matrix} order={history.order} options={selected.options} title="結果DSM · 現在のビュー" initialAnalysis analysisKind={selected.mode === 'structure'&&!isIgtaProfile(selected.algorithm.id) ? 'symmetric' : 'directed'} sharedMax={sharedMax} colorOptions={colorOptions} onColorChange={setColorOptions} {...(selected.membership ? { membership: selected.membership, membershipKind: '構造クラスタ' as const } : selected.scc ? { membership: selected.scc.membership, membershipKind: 'SCC' as const, ...(viewMetrics?.orderGuaranteed ? { bands: selected.scc.bandByElement } : {}) } : {})} /></div>
      <section className="panel" aria-label="表示順"><StepTitle tip="結果DSMの並び順です。手動で並べ替えると、手戻りなどの指標がどう変わるかを確認できます。">表示順</StepTitle>
        <p data-testid="view-order" className="order-line">現在の表示順: {history.order.map(i => matrix.elements[i]!.label).join(' → ')}</p>
        {viewMetrics && <div aria-label="現在のビュー指標" className="view-metrics"><p>現在のビュー: フィードバック重み {number(viewMetrics.feedbackWeight)} / 件数 {viewMetrics.feedbackCount} / 比 {number(viewMetrics.feedbackRatio)} / SCC間 {number(viewMetrics.interSccFeedbackWeight)}</p><p className={viewMetrics.orderGuaranteed ? 'muted' : 'callout warning'}>{viewMetrics.orderGuaranteed ? 'SCCブロックの先行順を維持しています。' : 'SCC間順序またはブロックの連続性が崩れています。現在のビューには元のBandと順序保証を適用しません。'}</p></div>}
        <OrderEditor matrix={matrix} history={history} analysisOrder={selected.order} onChange={view => setViews(previous => ({ ...previous, [selected.runId]: view }))} />
      </section>
      <section className="panel diagnostics-panel">
      <SearchDiagnostics key={selected.runId} run={selected} runs={runs}/>
      </section>
      {selected.tearing&&<MatrixCanvas matrix={{...matrix,values:virtualMatrix(preprocess(matrix,selected.options).directed,selected.tearing.edges).values}} order={selected.tearing.virtualOrder} title="仮想DSM · 候補依存を仮定した比較" initialAnalysis analysisKind="directed" options={{threshold:0,binary:false}} />}
      <section className="panel"><StepTitle tip="所属は元の並び（元index）で保持し、画面上の表示順とは区別しています。">所属と表示順位</StepTitle><div className="table-scroll"><table aria-label="所属と表示順位"><caption className="sr-only">所属は元indexで保持し、表示順とは区別します。</caption><thead><tr><th>ID / ラベル</th><th>元順位</th><th>表示順位</th><th>{selected.mode === 'structure' ? '構造クラスタ' : 'SCC'}</th>{selected.scc && <th>Band{!viewMetrics?.orderGuaranteed && '（元解析・現在ビューに非適用）'}</th>}</tr></thead><tbody>{matrix.elements.map(e => <tr key={e.id}><th>{e.id} / {e.label}</th><td>{e.originalIndex + 1}</td><td>{history.order.indexOf(e.originalIndex) + 1}</td><td>{(selected.membership ?? selected.scc!.membership)[e.originalIndex]! + 1}</td>{selected.scc && <td>{selected.scc.bandByElement[e.originalIndex]}</td>}</tr>)}</tbody></table></div></section>
    </>}
    {selected && <div className="next-step"><span>結果を確認したら、レポートとして保存できます。</span><button className="ghost" onClick={() => onTab?.('analysis')}>条件を変えて再解析</button><button className="primary" onClick={() => onTab?.('export')}>出力へ進む →</button></div>}
    </div>
    <div role="tabpanel" id="panel-export" aria-labelledby="tab-export" hidden={tab !== 'export'}>
    {matrix && <ExportPanel capture={capture} />}
    </div>
  </section>;
}
