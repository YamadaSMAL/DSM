# DSM解析Webアプリ

CSV/XLSXの依存行列を読み込み、構造クラスタリングと工程解析を行うブラウザ完結型アプリ。現在は **v0.4.0**。M0〜M6と探索・クラスタ診断を実装済み。IGTA系は原典と補完規則に基づく参照プロファイルで、著者MATLABコードとの一致確認は未実施。

## 起動

確認環境: Node.js 26.13.1 / npm 11.20.0。

```sh
npm ci
npm run dev
```

表示されたHTTP URLを開き、ファイル選択 →「検証してプレビュー」→「このデータを確定」→「解析を実行」の順に操作する。入力はメモリ上に保持し、自動保存・外部送信は行わない。再開にはセッションJSONを保存する。

## ドキュメント

| 目的 | 読むもの |
| --- | --- |
| アプリを使う | [利用ガイド](docs/user-guide.md) — 取込、全手法、診断、保存、制限 |
| コードを改善する | [開発ガイド](docs/development.md)、[設計判断](docs/decisions.md) |
| 仕様・IGTAの定義を確認する | [実装仕様書](docs/SPECIFICATION.md)、[IGTAアルゴリズム仕様](docs/IGTA_ALGORITHM_SPEC.md) |
| 検証・性能を確認する | [検証記録](docs/validation.md)、[性能測定](docs/benchmarks.md)、[測定JSON](docs/benchmarks/data/) |
| 原典・依存関係を確認する | [IGTA照合表](docs/algorithms/igta-conformance.md)、[出典・チェックサム](docs/algorithms/igta-sources.json)、[依存関係](docs/development.md#dependencies) |

文書の入口はこのREADMEに統一。日常操作は利用ガイド、コード変更は開発ガイドを参照する。検証は現況と過去の証拠を1冊にまとめ、旧版ガイドの重複は統合した。

## 開発時の確認

```sh
npm run check        # 型検査・単体/性質テスト・本番ビルド
npm run test:e2e     # 本番ブラウザ操作
npm run test:subpath # /test-repo/でWorker・保存・再読込
```

ブラウザの導入・Braveの指定・公開準備は[開発ガイド](docs/development.md)を参照。ビルドは `npm run build`、確認は `npm run preview`。外部公開は未実施。

## 構成

```text
src/                  アプリ・計算基盤・Worker
public/               配布用静的ファイル・第三者表記
tests/                単体・性質・ブラウザテストと固定fixture
docs/                 仕様・利用・開発・検証資料
  SPECIFICATION.md    実装仕様の正本
  IGTA_ALGORITHM_SPEC.md IGTA参照プロファイルの正本
trash/                不要な生成物の退避先（Git管理対象外）
```

内部規約は「行が列に依存」、グラフは列→行。元データを保持し、構造と工程を同じ優先度で扱う。入力は最大500要素（MCLは200要素）。詳細な制限・未確認事項は[利用ガイド](docs/user-guide.md#上限と未確認事項)を参照。
