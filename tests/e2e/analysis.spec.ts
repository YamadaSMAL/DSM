import { test, expect, type Page } from '@playwright/test';
import { reveal } from './tabs';
import fs from 'node:fs';
const source = async (page: Page, text: string) => {
  await page.goto('/'); await reveal(page.getByLabel('入力ファイル',{exact:true}));await page.getByLabel('入力ファイル',{exact:true}).setInputFiles({name:'analysis.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
  await reveal(page.getByRole('button',{includeHidden:true,name:'検証してプレビュー',exact:true}));await page.getByRole('button',{name:'検証してプレビュー',exact:true}).click(); await reveal(page.getByRole('button',{includeHidden:true,name:'このデータを確定',exact:true}));await page.getByRole('button',{name:'このデータを確定',exact:true}).click();
};
const run = async (page: Page) => { await reveal(page.getByRole('button',{includeHidden:true,name:'解析を実行',exact:true}));await page.getByRole('button',{name:'解析を実行',exact:true}).click(); await expect(page.getByTestId('analysis-status')).toContainText('completed'); };
const modules=',A,B,C,D\nA,0,1,0,0\nB,1,0,0,0\nC,0,0,0,1\nD,0,0,1,0';
test('構造: kの再利用、基準比較、条件差、所属と対称表示を確認する',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await source(page,modules); await run(page);
  const info=page.getByRole('region',{name:'選択結果の情報'});
  await reveal(info.getByText('新規計算',{exact:false}));await expect(info.getByText('新規計算',{exact:false})).toBeVisible(); await reveal(info.locator('.metric-grid').getByText('4',{exact:true}));await expect(info.locator('.metric-grid').getByText('4',{exact:true})).toBeVisible();
  const resultPane=page.getByRole('region',{name:'結果DSM · 現在のビュー'}); await expect(resultPane.getByTestId('cell-detail')).toContainText('構造クラスタ');
  await reveal(resultPane.getByRole('grid',{includeHidden:true}));await resultPane.getByRole('grid').focus(); await reveal(resultPane.getByRole('grid',{includeHidden:true}));await resultPane.getByRole('grid').press('ArrowRight'); await expect(resultPane.getByTestId('cell-detail')).toContainText('構造用の無向mean重み');
  await reveal(page.getByRole('region',{includeHidden:true,name:'元DSM · 入力順'}).getByLabel('対数配色',{exact:true}));await page.getByRole('region',{name:'元DSM · 入力順'}).getByLabel('対数配色',{exact:true}).check(); await expect(resultPane.getByLabel('対数配色',{exact:true})).toBeChecked();
  await reveal(page.getByLabel('クラスタ数 k',{exact:true}));await page.getByLabel('クラスタ数 k',{exact:true}).fill('1');await run(page);await expect(info).toContainText('併合履歴を再利用');
  await reveal(page.getByLabel('解析手法',{exact:true}));await page.getByLabel('解析手法',{exact:true}).selectOption('baseline-single-v1');await run(page);
  await expect(page.getByRole('table',{name:'解析結果一覧'}).locator('tbody tr')).toHaveCount(3);
  await reveal(page.getByLabel('調整コストのα',{exact:true}));await page.getByLabel('調整コストのα',{exact:true}).fill('2');await reveal(page.getByRole('region',{includeHidden:true,name:'選択結果の情報'}));await expect(info).toContainText('設定が変更されています');await run(page);
  await expect(page.getByRole('table',{name:'解析結果一覧'})).toContainText('比較対象外（条件差）');
  await reveal(page.getByLabel('結果1を選択',{exact:true}));await page.getByLabel('結果1を選択',{exact:true}).check();await reveal(page.getByRole('region',{includeHidden:true,name:'選択結果の情報'}));await expect(info).toContainText('設定が変更されています');
  await page.screenshot({path:'test-results/M2-structure.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('工程: 先行順・手動上下とドラッグ・undo/redo・原指標保持を確認する',async({page})=>{
  await source(page,',C,B,A\nC,0,1,0\nB,0,0,1\nA,0,0,0');await reveal(page.getByLabel('工程 · タスクの依存と順序',{exact:true}));await page.getByLabel('工程 · タスクの依存と順序',{exact:true}).check();await run(page);
  await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: A → B → C');
  await reveal(page.getByText('表示順を手動で変更（行・列を同時に移動）',{exact:true}));await page.getByText('表示順を手動で変更（行・列を同時に移動）',{exact:true}).click();
  await reveal(page.getByRole('button',{includeHidden:true,name:'順序 A e000003',exact:true}));await page.getByRole('button',{name:'順序 A e000003',exact:true}).focus();await reveal(page.getByRole('button',{includeHidden:true,name:'順序 A e000003',exact:true}));await page.getByRole('button',{name:'順序 A e000003',exact:true}).press('ArrowDown');
  await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: B → A → C');
  await expect(page.getByLabel('現在のビュー指標')).toContainText('フィードバック重み 1');await expect(page.getByLabel('現在のビュー指標')).toContainText('元のBandと順序保証を適用しません');
  const metrics=page.getByLabel('解析結果の指標');await expect(metrics.locator('[data-metric=feedbackWeight] strong')).toHaveText('0');
  await reveal(page.getByRole('button',{includeHidden:true,name:'undo',exact:true}));await page.getByRole('button',{name:'undo',exact:true}).click();await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: A → B → C');
  await reveal(page.getByRole('button',{includeHidden:true,name:'redo',exact:true}));await page.getByRole('button',{name:'redo',exact:true}).click();await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: B → A → C');
  await reveal(page.getByRole('button',{includeHidden:true,name:'解析順へ戻す',exact:true}));await page.getByRole('button',{name:'解析順へ戻す',exact:true}).click();
  await reveal(page.getByRole('button',{includeHidden:true,name:'順序 C e000001',exact:true}));await page.getByRole('button',{name:'順序 C e000001',exact:true}).dragTo(page.getByRole('button',{name:'順序 A e000003',exact:true}));await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: C → A → B');
  await reveal(page.getByRole('button',{includeHidden:true,name:'元順へ戻す',exact:true}));await page.getByRole('button',{name:'元順へ戻す',exact:true}).click();await expect(page.getByTestId('view-order')).toHaveText('現在の表示順: C → B → A');
  await page.screenshot({path:'test-results/M2-process.png',fullPage:true});
  await reveal(page.getByLabel('解析手法',{exact:true}));await page.getByLabel('解析手法',{exact:true}).selectOption('baseline-identity-v1');await run(page);await expect(page.getByLabel('解析結果の指標').locator('[data-metric=feedbackWeight] strong')).toHaveText('2');
  await reveal(page.getByLabel('実行する解析閾値',{exact:true}));await page.getByLabel('実行する解析閾値',{exact:true}).fill('1');await reveal(page.getByRole('region',{includeHidden:true,name:'選択結果の情報'}));await expect(page.getByRole('region',{name:'選択結果の情報'})).toContainText('設定が変更されています');
});
test('計算Workerの取消・再実行と入力差替えで状態を混在させない',async({page})=>{
  await source(page,modules);await run(page);
  // Hold only messages in the page-facing Worker transport, then cancel for deterministic race coverage.
  await page.evaluate(()=>{ const original=Worker.prototype.postMessage; Worker.prototype.postMessage=function(message: unknown, options?: Transferable[] | StructuredSerializeOptions) { if ((message as {type?:string}).type==='run') return; original.call(this,message,Array.isArray(options)?{transfer:options}:options); }; });
  // Current retained worker still works. Replace input to start a fresh workspace/worker.
  await reveal(page.getByRole('button',{includeHidden:true,name:'サンプル A → B → C',exact:true}));await page.getByRole('button',{name:'サンプル A → B → C',exact:true}).click();await reveal(page.getByRole('button',{includeHidden:true,name:'検証してプレビュー',exact:true}));await page.getByRole('button',{name:'検証してプレビュー',exact:true}).click();await reveal(page.getByRole('button',{includeHidden:true,name:'このデータを確定',exact:true}));await page.getByRole('button',{name:'このデータを確定',exact:true}).click();
  await reveal(page.getByRole('button',{includeHidden:true,name:'解析を実行',exact:true}));await page.getByRole('button',{name:'解析を実行',exact:true}).click();await reveal(page.getByRole('button',{includeHidden:true,name:'解析を取消',exact:true}));await page.getByRole('button',{name:'解析を取消',exact:true}).click();await expect(page.getByTestId('analysis-status')).toContainText('cancelled');
  await expect(page.getByRole('table',{name:'解析結果一覧'})).toHaveCount(0);
  await page.reload();await source(page,modules);await run(page);await expect(page.getByRole('table',{name:'解析結果一覧'}).locator('tbody tr')).toHaveCount(1);
});
test('500要素の両解析をWorker内で3回計測する',async({page,browser})=>{
  test.setTimeout(120_000);
  const results:{n:number;density:number;algorithm:string;samplesMs:number[];medianMs:number;maxMs:number}[]=[];
  for(const n of [100,200,500])for(const density of [0,.01,.1,1]) {
    let seed=20261116;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const text=','+Array.from({length:n},(_,i)=>`E${i}`).join(',')+'\n'+Array.from({length:n},(_,i)=>`E${i},`+Array.from({length:n},(_,j)=>i!==j&&random()<density?'1':'0').join(',')).join('\n');
    for(const algorithm of ['hierarchical-average-v1','scc-tarjan-kahn-v1']) {
      const samplesMs:number[]=[];
      for(let iteration=0;iteration<3;iteration++) {
        await source(page,text);if(algorithm==='scc-tarjan-kahn-v1')await page.getByLabel('工程 · タスクの依存と順序',{exact:true}).check();await run(page);
        const elapsed=await page.getByRole('table',{name:'解析結果一覧'}).locator('tbody tr').first().locator('td').nth(2).innerText();samplesMs.push(Number(elapsed.match(/([\d.]+)ms/)![1]));
      }
      const sorted=[...samplesMs].sort((a,b)=>a-b);results.push({n,density,algorithm,samplesMs,medianMs:sorted[1]!,maxMs:Math.max(...samplesMs)});
    }
  }
  fs.writeFileSync('test-results/M2-benchmarks.json',JSON.stringify({browser:browser.version(),seed:20261116,repetitions:3,note:'本番WorkerのrunAnalysis内部経過時間。前処理・ハッシュ・指標を含み、転送・描画は除外。キャッシュなし。',results},null,2));
  for(const row of results.filter(r=>r.n===500))expect(row.maxMs).toBeLessThan(row.algorithm==='hierarchical-average-v1'?15000:2000);
});
