import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App';
it('両モードを対等に提示し、M1の取込と未実装解析を明示する', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('部品・組織のまとまり'); expect(html).toContain('タスクの依存と順序'); expect(html).toContain('M1 · データ確認版'); expect(html).toContain('解析を実行（M2）'); expect(html).not.toContain('NaN'); expect(html).not.toContain('undefined');
});
