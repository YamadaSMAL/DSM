import type { Locator } from '@playwright/test';

/**
 * 画面はタブ（データ / 解析 / 結果 / 出力）に分かれ、非表示タブの要素は操作できない。
 * 操作対象を含むタブパネルを特定し、必要ならそのタブへ切り替える。
 * 対象がタブパネル外（出力したHTMLレポートなど）なら何もしない。
 * getByRole は非表示要素を除外するため、呼び出し側は includeHidden:true の locator を渡す。
 */
export async function reveal(locator: Locator): Promise<void> {
  const panelId = await locator.first().evaluate(element => element.closest('[role=tabpanel]')?.id ?? null).catch(() => null);
  if (!panelId) return;
  const tab = locator.page().locator(`[role=tab][aria-controls="${panelId}"]`);
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}
