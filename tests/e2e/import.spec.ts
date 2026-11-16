import { test, expect, type Page } from '@playwright/test';
import { utils, write } from 'xlsx';
import fs from 'node:fs';
const inspect = async (page: Page) => {
  await page.getByRole('button', { name: '検証してプレビュー', exact: true }).click();
  await expect(page.getByRole('heading', { name: '02 · プレビューを確認' })).toBeVisible();
};
const confirm = async (page: Page) => {
  await page.getByRole('button', { name: 'このデータを確定', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};
const upload = async (page: Page, text: string, name = 'test.csv') => page.getByLabel('入力ファイル', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
test('プレビュー確定・検索・ズーム・矢印詳細・取消・再取込を実操作する', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'サンプル A → B → C', exact: true }).click(); await inspect(page);
  await expect(page.getByRole('grid')).toHaveCount(0); await confirm(page);
  const grid = page.getByRole('grid'); await grid.focus(); await grid.press('ArrowDown');
  await expect(page.getByTestId('cell-detail')).toContainText('B が A に依存。情報の方向: A → B');
  await grid.click({ position: { x: 360, y: 500 } });
  await expect(page.getByTestId('cell-detail')).toContainText('C が B に依存。情報の方向: B → C');
  await page.getByPlaceholder('ラベル / ID').fill('e000003');
  await page.getByRole('button', { name: 'C · e000003', exact: true }).click(); await expect(page.getByTestId('cell-detail')).toContainText('行: C');
  await page.getByLabel('ズーム', { exact: true }).fill('3'); await expect(page.getByRole('status').filter({ hasText: '3.0倍' })).toBeVisible();
  const bounds = await grid.boundingBox();
  await page.mouse.move(bounds!.x + 400, bounds!.y + 400); await page.mouse.down(); await page.mouse.move(bounds!.x + 250, bounds!.y + 250, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('cell-detail')).toContainText('行: C');
  await page.getByRole('button', { name: '選択行の表形式表示', exact: true }).click(); await expect(page.getByRole('caption')).toHaveText('C の行');
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  await page.screenshot({ path: 'test-results/M1-desktop.png', fullPage: true });
  await upload(page, ',甲,乙\n甲,0,0\n乙,1,0'); await inspect(page); await page.getByRole('button', { name: 'プレビューを取消', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DSM · 3要素', exact: true })).toBeVisible();
  await inspect(page); await confirm(page); await expect(page.getByRole('heading', { name: 'DSM · 2要素', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/M1-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('エラーと方向プレビュー、列照合・変換履歴を確認する', async ({ page }) => {
  await page.goto('/'); await upload(page, ',B,A\nA,2,0\nB,0,1'); await inspect(page);
  await expect(page.getByRole('button', { name: 'このデータを確定', exact: true })).toBeDisabled(); await expect(page.getByText('列照合案（適用には詳細設定の選択と再検証が必要）', { exact: true })).toBeVisible();
  await page.getByText('値変換と詳細設定（既定では変換しません）', { exact: true }).click(); await page.getByLabel('列照合案を適用', { exact: true }).check();
  await page.getByLabel('入力方向', { exact: true }).selectOption('row-supplies-column'); await expect(page.locator('.direction-preview')).toContainText('B → A');
  await inspect(page); await expect(page.getByText('align-columns:', { exact: false })).toBeVisible(); await expect(page.getByText('transpose:', { exact: false })).toBeVisible(); await confirm(page);
  await upload(page, ',A\nA,-1'); await inspect(page); await expect(page.getByRole('alert')).toContainText('B2'); await expect(page.getByRole('button', { name: 'このデータを確定', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'DSM · 2要素', exact: true })).toBeVisible();
});
test('XLSXのシート・範囲・数式拒否とキャッシュ、取消で有効データを保持する', async ({ page }) => {
  const book = utils.book_new(); utils.book_append_sheet(book, utils.aoa_to_sheet([[0]]), '最初');
  const sheet = utils.aoa_to_sheet([['', 'A', 'B'], ['A', 0, 0], ['B', 1, 0]]); sheet['B3'] = { t: 'n', v: 2, f: '1+1' }; utils.book_append_sheet(book, sheet, '日本語');
  await page.goto('/'); await page.getByLabel('入力ファイル', { exact: true }).setInputFiles({ name: 'fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer) });
  await page.getByLabel('シート名', { exact: true }).fill('日本語'); await page.getByLabel('A1範囲', { exact: true }).fill('A1:C3'); await inspect(page); await expect(page.getByRole('alert')).toContainText('B3');
  await page.getByText('値変換と詳細設定（既定では変換しません）', { exact: true }).click(); await page.getByLabel('保存済み計算値を利用（古い可能性・再計算なし）', { exact: true }).check(); await inspect(page); await confirm(page);
  await page.getByRole('grid').focus(); await page.getByRole('grid').press('ArrowDown'); await expect(page.getByTestId('cell-detail')).toContainText('値: 2');
  // Real Worker cancellation while a new import is running.
  const size = 500; const text = Array.from({ length: size + 1 }, (_, r) => r === 0 ? ',' + Array.from({ length: size }, (_, i) => `E${i}`).join(',') : `E${r - 1},` + Array(size).fill('0').join(',')).join('\n');
  await upload(page, text, 'large.csv'); await page.getByRole('button', { name: '検証してプレビュー', exact: true }).click(); await page.getByRole('button', { name: '取込を取消', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DSM · 2要素', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '02 · プレビューを確認' })).toHaveCount(0);
});
test('未信頼ラベルを文字列として表示し、操作中に外部送信しない', async ({ page }) => {
  const external: string[] = []; page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('ws://127.0.0.1:4173/')) external.push(request.url()); });
  await page.goto('/'); await upload(page, ',<img src=x onerror=alert(1)>,<img src=x onerror=alert(1)>\n<img src=x onerror=alert(1)>,0,0\n<img src=x onerror=alert(1)>,1,0'); await inspect(page); await confirm(page);
  expect(await page.locator('img').count()).toBe(0); await page.getByPlaceholder('ラベル / ID').fill('img'); await expect(page.getByRole('button', { name: /e000001/ })).toBeVisible(); await expect(page.getByRole('button', { name: /e000002/ })).toBeVisible(); expect(external).toEqual([]);
});
test('100/200/500要素・4密度の取込から初期描画を計測する', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const results: { n: number; density: number; samplesMs: number[]; medianMs: number; maxMs: number }[] = [];
  for (const n of [100, 200, 500]) for (const density of [0, .01, .1, 1]) {
    let seed = 20261116;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const text = ',' + Array.from({ length: n }, (_, i) => `要素${i + 1}`).join(',') + '\n' + Array.from({ length: n }, (_, r) => `要素${r + 1},` + Array.from({ length: n }, (_, c) => r !== c && random() < density ? '1' : '0').join(',')).join('\n');
    const samplesMs: number[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      await page.goto('/'); await upload(page, text, `n${n}.csv`);
      const start = performance.now(); await inspect(page); await confirm(page); samplesMs.push(performance.now() - start);
    }
    if (n === 500 && density === 1) await page.screenshot({ path: 'test-results/M1-500.png', fullPage: true });
    const sorted = [...samplesMs].sort((a,b) => a-b); results.push({ n, density, samplesMs, medianMs: sorted[1]!, maxMs: Math.max(...samplesMs) });
  }
  const report = { browser: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), viewport: { width: 1360, height: 1000 }, devicePixelRatio: await page.evaluate(() => devicePixelRatio), seed: 20261116, repetitions: 3, note: 'Playwright操作・プレビュー表示・自動確定・Canvasの2フレーム待ちを含む。人の確認時間を除く。', results };
  fs.writeFileSync('test-results/M1-benchmarks.json', JSON.stringify(report, null, 2)); await testInfo.attach('benchmarks', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  for (const row of results.filter(r => r.n === 500)) expect(row.maxMs).toBeLessThan(5000);
});
