# DSM解析Webアプリ

[実装仕様書](SPECIFICATION.md)を正本とするブラウザ完結型アプリ。M0の計算基盤、M1の取込・検証・可視化、M2の最小解析・比較・手動順序ビュー、M3の出力・セッション復元、M4の焼きなまし・MCL・複数seed比較を実装済み（v0.2.0）。

## 起動と検証

Node.js 26.13.1 / npm 11.20.0で確認。依存は固定版とlockfileで管理する。

```sh
npm ci
npm run dev
```

表示されたローカルURLを開く。サンプルを選ぶかCSV/XLSXを選択し、「検証してプレビュー」→内容と変換履歴を確認→「このデータを確定」でDSMを表示する。設定変更後は再検証が必要。取消や不正ファイルで確定済みデータは失われない。

確定後に構造／工程を選び、閾値・二値化・k・αを設定して「解析を実行」。構造は平均連結クラスタリング、工程はTarjan SCC + Kahn先行順・Bandを計算する。結果の条件と指標、元DSMと結果DSMを比較できる。

```sh
npm run check       # 型検査・単体/性質テスト・本番ビルド
npx playwright install chromium
npm run test:e2e    # 本番ビルド・出力・オフラインHTMLを検証
npm run test:subpath # /test-repo/でWorker・保存再読込を検証
```

検証環境のBraveを使う場合:

```sh
DSM_BROWSER_EXECUTABLE='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run test:e2e
```

`npm run preview`で `dist/` を配信できる。GitHub Pagesのworkflowは準備済み。公開先は未設定で外部公開は未実施。サブパスは `DSM_BASE_PATH=/repository-name/ npm run build` で指定する。通常アプリはHTTP(S)で開き、distの直接ダブルクリックには対応しない。

## 現在の実装範囲

- **M0**: 行列モデル、方向規約、元対角の保持、D/S前処理、順列、構造・工程指標、SHA-256、F01〜F10と性質テスト。
- **M1入力**: ドロップ／選択、CSV（UTF-8・明示Shift_JIS、区切り推定／指定）とXLSX（シート・A1範囲）。ラベル付き／なし、明示的な列照合・記号／欠損変換、数式の既定拒否と有限数値キャッシュの任意利用。
- **M1検証**: 座標・元値・理由・修正方法、エラー総数と先頭100件、重複・非対称・全0・非ゼロ対角警告、変換履歴、元セル表と正規化後プレビュー、2種類のハッシュ。
- **M1実行**: 専用Worker、runId/revisionとUI世代による応答照合、即時取消、20秒上限、異常終了時の入力保持。
- **M1表示**: Canvas、DOM見出し・詳細、検索（同名全件＋ID）、ズーム・ドラッグパン、ホバー強調・クリック固定・矢印移動、選択行の代替表、元A／解析D切替、閾値・二値化、対数／代替配色、対角切替。

- **M2解析**: 平均連結の階層法（全併合履歴、k変更時再利用）、非再帰Tarjan・縮約DAG・Kahn先行順・最長先行Band。構造／工程の指標、基準解、条件を一致させた順位付け。
- **M2実行・比較**: 計算Worker、コピー転送、協調取消と1秒フォールバック、30秒上限、版・条件・ハッシュ付きの完了結果、条件変更後の旧結果区別、共通色スケールの左右Canvas。
- **M2ビュー**: 構造クラスタ／SCCを線と番号・所属表で表示。ドラッグ／上下矢印による同時並べ替え、元順／解析順へ復帰、undo/redo（100変更）。ビューごとの工程指標と順序保証の検査。元解析は上書きしない。

- **M3出力**: 単独HTML（file://でオフライン検索・ズーム・パン・詳細、印刷画像）、XLSXの9シート、セッションJSON。出力開始時の選択結果・現在ビューを固定し、Workerで整合性・指標を再検証する。
- **M3復元・配信**: JSONの型・寸法・元セル・ハッシュ・結果・ビューを検証し、プレビュー確定で復元。CIとPages用workflow、/test-repo/配下のE2Eを追加。公開は有効化設定を行うまで実行しない。

- **M4探索**: 構造所属とSCC内順序の焼きなまし、seed付き有限予算、最良解保持・差分評価。MCLはアプリ独自の排他的抽出、列正規化・prune・収束判定、上限200要素。
- **M4実行・保存**: 既定10seedを逐次処理し、成功例の最良・中央値・最悪・母標準偏差・成功数を表示。時間上限／取消の暫定解、MCL未収束を区別しランキングから除外。seed・初期解・停止条件・暫定状態を保存／復元する。

内部は「行が列に依存」、グラフは列→行。逆規約の入力は転置して記録する。元セル表・元A・解析用行列を分け、既存domain関数を共用して元データを変更しない。構造／工程のモードは同じ優先度。IGTA++はM5で原典照合後に追加する。

## 対応上限と制限

ファイル20MiB、要素数1〜500、ラベル200文字。CSV/TSVと `.xlsx` のほか、64MiBまでのセッションJSONを再読込できる。`.xls`・`.xlsm`・暗号化ブックは非対応。XLSXの結合・日付・真偽値・エラーセルは拒否。非表示内容も選択範囲なら含む。数式は再計算せず、保存済み計算値は古い可能性がある。

XLSXは実展開量100MiB・10,000エントリで中断する。SheetJSへは展開後の無圧縮ZIPを渡す。選択範囲はヘッダー込み501×501まで。巨大な申告範囲は範囲指定で絞る必要がある。展開上限は総メモリ上限ではなく、ブック全体のXML解釈と一時コピーの追加メモリを要する。

ブラウザ操作はBrave（Chromium）で検証。Chrome／Edge／Firefox／Safariの個別互換性、30fpsの継続パン、最大メモリは未検証。XLSX出力は型・列幅を保持し、式とリンクを生成しない。手動並べ替え・undo/redoは実装済み。階層法は最悪O(n³)で大域最適を保証せず、Tarjan/Kahn単独のSCC内は元index順。焼きなましで内部順序を探索しても循環やフィードバックが消える保証はない。Bandは同時実行の保証ではない。

## 主なファイル

| 場所 | 内容 |
| --- | --- |
| `src/domain/` | UIに依存しないモデル・前処理・計算・ハッシュ |
| `src/io/` | CSV/XLSX取込、セッション検証、HTML/XLSX/JSON出力 |
| `src/algorithms/` | 固定registry、階層法、SCC・順序・Band、実行・条件比較 |
| `src/state/` | 結果ごとの非破壊ビュー・undo/redo |
| `src/workers/` | メッセージ契約、取込／解析／入出力Worker、取消・時間上限 |
| `src/ui/` | 入力／確定フロー、Canvas、検索・詳細 |
| `tests/unit/`, `tests/property/` | 数値基盤・取込・Workerの検証 |
| `tests/e2e/` | 本番ブラウザ操作と100/200/500要素ベンチマーク |
| `docs/decisions.md` | 判断・理由・次段階への契約 |
| `docs/M0-validation.md`, `docs/M1-validation.md`, `docs/M2-validation.md`, `docs/M3-validation.md`, `docs/M4-validation.md` | 段階別検証記録 |
| `docs/benchmarks.md` | 基準環境、実測と未検証事項 |
| `docs/dependencies.md` | 固定版、取得元、ライセンス |

M2の詳細・性能値は [M2検証記録](docs/M2-validation.md) と [benchmarks](docs/benchmarks.md)。追加の外部依存はない。M3の使い方・保存・公開設定は [v0.1手順書](docs/v0.1-guide.md)、検証は [M3検証記録](docs/M3-validation.md)。M4の操作と制限は [v0.2手順書](docs/v0.2-guide.md)、検証は [M4検証記録](docs/M4-validation.md)。M5は研究着手済み・未完了。名称・式・未確認操作は [IGTA原典照合表](docs/algorithms/igta-conformance.md)、数式の検証範囲と必要資料は [M5検証記録](docs/M5-validation.md)。研究ゲートを通過するまでIGTA系の公開手法は追加しない。

入力情報はメモリのみで保持し、自動保存・外部送信しない。ページを再読込すると失われる。再開にはセッションJSONを保存し、入力ファイルから検証・再読込する。HTML/XLSXは閲覧・共有用。
