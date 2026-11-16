# M3検証記録（v0.1.0）

実施: 2026-11-16（日本時間）。仕様14のM3。HTML/XLSX/JSONの出力、JSON復元、CI・Pages準備を実装。追加の外部依存なし。

## 結果

| 確認 | 結果 |
| --- | --- |
| 引継ぎ時のcheck | 型検査・149テスト・本番ビルド合格 |
| 最終 `npm run check` | strict型検査・9ファイル178テスト・本番ビルド合格 |
| 通常ブラウザE2E | M1/M2/M3の13シナリオ合格（57.8秒） |
| 最終M3対象E2E | 出力の4シナリオを再確認し全件合格（7.8秒） |
| サブパスE2E | /test-repo/で1シナリオ合格（2.2秒） |
| HTMLの構文・画面 | 閲覧用JSのnode --check、file://の画面画像を確認 |
| workflow | YAML構文解析・job構成をローカル確認。GitHub上では未実行 |

Brave 157.1.99.57内Chromium 157.0.8103.79、Playwright 1.56.1、一時プロファイル・headless、本番buildをVite previewで配信。Node.js 26.13.1 / npm 11.20.0。専用Chromiumの再導入はせず、M1/M2と同じ検証用実行ファイルを指定した。

```sh
npm run check
DSM_BROWSER_EXECUTABLE='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run test:e2e
DSM_BROWSER_EXECUTABLE='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run test:subpath
```

## M3受入条件

| 条件 | 検証 |
| --- | --- |
| 単独HTMLのfile://オフライン | 保存HTMLをファイルURLで開き、ブラウザをofflineへ設定。検索・重複ラベル全件・ズーム・パン・矢印セル詳細が動作。HTTPリクエスト0件。印刷画像はdata URL、印刷用表示も確認 |
| JavaScript無効 | 別コンテキストで実行を無効にし、概要・所属表を閲覧。印刷画像srcが生成されていないことも確認。案内用noscriptの検出に依存した初回テストを、受入条件である静的内容の確認へ修正 |
| XLSX往復 | 9シート、元対角、D/S、同時置換、元セル、ラベルの文字列型、列幅、ID・所属・表示順位、条件と指標を照合。OriginalDSMを再取込し、RunConfigの条件で再解析して指標・所属が一致 |
| JSON往復 | 原セルとA、全結果、前処理、手動order/past/future、タイトル・配色を保存。読込検証・プレビュー・確定後に再実行し、同じ順序・指標を確認。revisionの振り直し後も入力ハッシュは同じ |
| 未信頼ラベル | img風ラベル、script終了文字列、=HYPERLINK文字列が実行されない。HTMLにユーザー由来のimgが生成されず、ダイアログ0件。XLSXの全セルにf/l属性なし。原式は文字列として保存 |
| スナップショット | 出力メッセージをテスト内で遅延し、その間に結果を切り替え。XLSXの手法・指標は押下時点の選択結果、画面は切替先の結果であり、混在しない |
| 破損・未知データ | 未知スキーマ／手法版、型・ID・値・元セル・所属・順序・SCC/Band・木・ハッシュ・指標・revision・設定・履歴の不整合、予約キー、深い入れ子、サイズ超過を拒否 |
| 保持・取消 | 不正JSON後も入力と既存完了結果を保持。入出力Workerの取消・30秒上限・異常終了・古い応答・ファイル読込の遅着を単体検証。元行列バッファを転送しない |
| サブパス | /test-repo/のアプリ・サンプル、取込/解析/入出力の3Worker、各形式のダウンロード、JSON再読込を確認。リクエスト失敗0件、アセットのルートパス固定なし |

## 500要素の出力

密な有向500要素をSCC解析して各形式を1回出力。出力押下から保存完了表示までを測定し、検証・生成・転送・ダウンロードを含む。原セル値は0/1、日本語ラベル。JSONは64MiB以内。HTMLをfile://で開き、検索・詳細が動作し、2つのCanvasと1万個未満の表セルで表示することを確認した。500²のDOMセルを生成していない。

時間・サイズは [M3-benchmark-results.json](M3-benchmark-results.json) と [benchmarks.md](benchmarks.md)。各1回の実測で性能保証ではない。画面: [オフラインHTML](screenshots/M3-offline.png)（文字列扱いの検証用ラベルを含む）。

## 未確認・制限

- GitHub Actionsの実行、Pagesの公開先・権限・公開URLでの動作は未確認。workflowは準備済みだが、リモート作成・push・公開は行っていない。公開先の決定と変数設定が必要。
- Chrome/Edge/Firefox/Safariの個別互換性、DPR=2実機、継続30fps、最大メモリは未確認。Braveの結果を他製品の動作保証としない。
- セッションはschemaVersion=1、64MiB・100結果・各履歴100件。原セル文字列／式は各1Mi文字まで。XLSXの原セル文字列が32,767文字を超える場合はエラーとし、切り詰めない。
- 入出力の整合性再検証は同梱手法の決定的再実行に依存する。未知の実装版は拒否。原ファイルバイト列を保存しないため、そのファイル自体のハッシュ検証や原書式の復元はできない。
- 手順・制限・公開設定は [v0.1-guide.md](v0.1-guide.md)。次はM4。IGTA++はM5の研究ゲートを維持する。
