# DSM解析Webアプリ

[実装仕様書](../SPECIFICATION.md)に沿ったブラウザ完結型アプリ。現在はM0（開発・計算基盤）を実装済み。

## 起動と検証

Node.js 26.13.1 / npm 11.20.0で確認。依存は固定版とlockfileで管理する。

```sh
npm ci
npm run dev
```

表示されたローカルURLをブラウザで開く。M0画面は固定サンプルの指標を示す確認版。

```sh
npm run typecheck
npm test
npm run build
```

まとめて確認する場合は `npm run check`。継続的な単体テストは `npm run test:watch`。本番成果物は `dist/`。`npm run preview`でビルド結果を配信できる。GitHub Pagesのサブパスは、後続段階で公開先に合わせて `DSM_BASE_PATH=/repository-name/ npm run build` と指定する。

## M0の実装範囲

- TypeScript strict / Vite / React、Gitリポジトリ（main）を初期化。
- 行列・要素・来歴・前処理の型、1〜500要素の入力検証。
- 行が列に依存する方向規約、逆規約の転置、j→iの依存辺。
- 対角を保持する元データと、対角除外・閾値・二値化後のD、mean対称化後のS。
- 行列同時置換、逆置換、構造コストと工程フィードバック指標。
- 原ファイル用SHA-256、解析入力の正規化直列化とハッシュ。
- F01〜F10、全順列オラクル、固定seedの性質テスト、起動画面の描画テスト。

M0では数値行列を入力境界とする。CSV/XLSXのセル解釈・ラベル照合・重複警告・Canvas表示はM1、クラスタリングとSCC／順序付けはM2。現時点で最適化やファイル解析を実行できるとは表示しない。

## 主なファイル

| 場所 | 内容 |
| --- | --- |
| `src/domain/` | UIに依存しないデータ・計算・検証 |
| `src/ui/` | 起動確認画面 |
| `tests/fixtures/` | F01〜F10と手計算の根拠 |
| `tests/unit/` | 方向・指標・ハッシュ・描画のテスト |
| `tests/property/` | 置換・対称性・独立評価等、各200ケースの性質テスト |
| `docs/decisions.md` | 仕様の具体化と判断理由 |
| `docs/benchmarks.md` | 基準端末、対象ブラウザと確認状況 |
| `docs/M0-validation.md` | 実行済み検証と限界 |
| `docs/dependencies.md` | 固定依存版、配布元、ライセンス一覧 |

ブラウザの目視確認は環境の接続・操作権限制限により未実施。自動テストとビルド、HTTP応答は確認済み。詳細は検証記録を参照。

## 次の段階への引継ぎ

M1は元セル表を保持するimport層を追加し、検証後の数値行列から `createMatrixData` を呼ぶ。欠損や記号を無条件に0へ変換しない。入力方向を渡し、元バイト列のSHA-256をprovenanceへ入れる。前処理パイプラインはdomainの関数を共用し、UIやWorkerで独自の指標計算を増やさない。

浮動小数点の完全一致を前提にするのは整数・2の累乗分母のテストのみ。それ以外は仕様13.2の許容差を利用する。Bufferは所有権に基づくreadonly契約であり、Float64Array自体をfreezeしていない。表示・Worker側から元配列を変更せず、必要なコピーを作る。
