import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App';

it('起動画面は二つの解析を対等に示し、未実装範囲を明示する', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('部品・組織のまとまり');
  expect(html).toContain('タスクの依存と順序');
  expect(html).toContain('基盤確認版');
  expect(html).toContain('ファイルの読み込みとDSM表示はM1');
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('undefined');
});
