import {test,expect} from '@playwright/test';
import { reveal } from './tabs';
import fs from 'node:fs';
test('M6の4密度・各3回の計算Worker性能を記録する',async({page,browser})=>{
 test.skip(!process.env['DSM_M6_BENCHMARK'],'明示的な性能計測時のみ実行');test.setTimeout(900_000);
 const results:{n:number;density:number;algorithm:string;trials:{elapsedMs:number;iterations:number;evaluations:number;status:string;acyclic:boolean|null}[];medianMs:number;maxMs:number}[]=[];
 for(const n of [100,200,500])for(const density of [0,.01,.1,1]){
  let seed=20261118;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const text=','+Array.from({length:n},(_,i)=>'E'+i).join(',')+'\n'+Array.from({length:n},(_,i)=>'E'+i+','+Array.from({length:n},(_,j)=>i!==j&&random()<density?1:0).join(',')).join('\n');
  for(const algorithm of ['ga-cluster-v1','tearing-greedy-v1']){const trials:{elapsedMs:number;iterations:number;evaluations:number;status:string;acyclic:boolean|null}[]=[];
   for(let repetition=0;repetition<3;repetition++){
    await page.goto('/');await reveal(page.getByLabel('入力ファイル',{exact:true}));await page.getByLabel('入力ファイル',{exact:true}).setInputFiles({name:'M6-benchmark.csv',mimeType:'text/csv',buffer:Buffer.from(text)});await reveal(page.getByRole('button',{includeHidden:true,name:'検証してプレビュー',exact:true}));await page.getByRole('button',{name:'検証してプレビュー',exact:true}).click();await reveal(page.getByRole('button',{includeHidden:true,name:'このデータを確定',exact:true}));await page.getByRole('button',{name:'このデータを確定',exact:true}).click();if(algorithm.startsWith('tearing'))await page.getByLabel('工程 · タスクの依存と順序',{exact:true}).check();await reveal(page.getByLabel('解析手法',{exact:true}));await page.getByLabel('解析手法',{exact:true}).selectOption(algorithm);if(algorithm.startsWith('ga')){await reveal(page.getByLabel('seed反復数',{exact:true}));await page.getByLabel('seed反復数',{exact:true}).fill('1');await reveal(page.getByLabel('root seed',{exact:true}));await page.getByLabel('root seed',{exact:true}).fill('20261118');}
    await reveal(page.getByRole('button',{includeHidden:true,name:'解析を実行',exact:true}));await page.getByRole('button',{name:'解析を実行',exact:true}).click();await expect(page.getByRole('button',{includeHidden:true,name:'解析を実行',exact:true})).toBeEnabled({timeout:60_000});await page.getByRole('region',{name:'選択結果の情報'}).evaluate(r=>r.querySelectorAll('details').forEach(d=>{(d as HTMLDetailsElement).open=true;}));const info=await page.getByRole('region',{name:'選択結果の情報'}).innerText(),counts=info.match(/反復=(\d+) \/ 評価=(\d+) \/ 経過=([\d.]+)ms/)!,status=info.match(/revision 1 · (\S+) \//)![1]!,acyclic=algorithm.startsWith('tearing')?(await page.getByRole('region',{name:'Tearing提案'}).innerText()).includes('仮想DAG: true'):null;trials.push({elapsedMs:Number(counts[3]),iterations:Number(counts[1]),evaluations:Number(counts[2]),status,acyclic});
   }
   const times=trials.map(t=>t.elapsedMs).sort((a,b)=>a-b);results.push({n,density,algorithm,trials,medianMs:times[1]!,maxMs:times[2]!});fs.writeFileSync('test-results/M6-benchmarks.json',JSON.stringify({browser:browser.version(),inputSeed:20261118,searchSeed:20261118,repetitions:3,note:'既定条件。GA50個体200世代、Tearing最大10000辺（n*(n-1)以下）。Worker内時間、転送・描画を除外。',results},null,2));
  }
 }
});
