import {test,expect} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
test('test-repo配下のアプリ・サンプル・取込/計算/出力Worker・保存再読込',async({page})=>{
  const broken:string[]=[],urls:string[]=[];page.on('requestfailed',r=>broken.push(r.url()));page.on('request',r=>urls.push(r.url()));
  await page.goto('./');await page.getByRole('button',{name:'サンプル A → B → C',exact:true}).click();await page.getByRole('button',{name:'検証してプレビュー',exact:true}).click();await page.getByRole('button',{name:'このデータを確定',exact:true}).click();await page.getByRole('button',{name:'解析を実行',exact:true}).click();await expect(page.getByTestId('analysis-status')).toContainText('completed');
  const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'セッションJSONを保存',exact:true}).click();const file=await waiting,target=path.resolve('test-results/subpath/session.json');fs.mkdirSync(path.dirname(target),{recursive:true});await file.saveAs(target);await page.reload();await page.getByLabel('入力ファイル',{exact:true}).setInputFiles(target);await page.getByRole('button',{name:'検証してプレビュー',exact:true}).click();await page.getByRole('button',{name:'このデータを確定',exact:true}).click();await expect(page.getByRole('table',{name:'解析結果一覧'}).locator('tbody tr')).toHaveCount(1);
  for(const button of ['単独HTMLを書き出す','XLSXを書き出す']){const download=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();await download;await expect(page.getByTestId('export-status')).toContainText('保存しました');}
  expect(broken).toEqual([]);expect(urls.some(u=>u.includes('/test-repo/assets/import.worker-'))).toBe(true);expect(urls.some(u=>u.includes('/test-repo/assets/analysis.worker-'))).toBe(true);expect(urls.some(u=>u.includes('/test-repo/assets/artifact.worker-'))).toBe(true);expect(urls.filter(u=>/^https?:/.test(u)).every(u=>u.startsWith('http://127.0.0.1:4174/test-repo/'))).toBe(true);
});
