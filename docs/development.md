# 開発ガイド

実装要件は [SPECIFICATION.md](SPECIFICATION.md)、IGTAの操作規則は [IGTA_ALGORITHM_SPEC.md](IGTA_ALGORITHM_SPEC.md) が正本。追加の判断は [decisions.md](decisions.md) に日付・理由・影響を記録する。現在の操作・上限は [利用ガイド](user-guide.md)、確認済み範囲は [検証記録](validation.md) を参照。

[テスト](#テスト) · [配信](#配信と公開準備) · [依存関係](#dependencies)

## 環境と起動

確認環境はNode.js 26.13.1 / npm 11.20.0。.nvmrc、package.json、package-lock.jsonで版を管理する。

```sh
npm ci
npm run dev
```

固定依存・取得元・ライセンスは [依存関係](development.md#dependencies)。通常アプリはHTTP(S)で起動する。ビルドは `npm run build`、ローカル確認は `npm run preview`。

## コードの構成

| 場所 | 責務 |
| --- | --- |
| `src/domain/` | 行列・方向規約・前処理・順列・共有指標・SHA-256 |
| `src/algorithms/` | registry・検証、階層法、SCC/Band、SA、MCL、GA、IGTA、Tearing、診断 |
| `src/io/` | CSV/XLSX取込、入力検証、セッションの再計算照合、HTML/XLSX/JSON出力 |
| `src/workers/` | 取込／解析／出力Worker、メッセージ契約、取消・時間上限 |
| `src/state/` | 結果ごとの非破壊ビュー、undo/redo |
| `src/ui/` | 入力・確定、条件、結果表、Canvas、セル詳細、探索診断 |
| `tests/fixtures/` | F01〜F10と期待値、変更前探索の固定結果 |
| `tests/unit/`, `tests/property/` | 計算・取込・Worker・保存の単体／性質テスト |
| `tests/e2e/` | 本番ブラウザ操作、オフラインHTML、サブパス、性能計測 |
| `public/` | 配布用静的ファイル・第三者表記 |

内部は「行が列に依存」、グラフは列→行。元A・原セルを保持し、零対角D・mean対称化Sを別に作る。既存domain関数を共用し、表示順の変更と解析時の所属を分離する。

結果には入力ハッシュ、手法・指標の版、前処理・パラメータ、seed・PRNG、停止理由を保持する。JSONは同じ条件の再計算で照合する。履歴は省略可能項目で旧セッションを読み込める。新しい項目や手法を追加するときは比較条件・途中停止の再現・保存検証にも反映する。

取込・解析の応答はrunId/revisionとUI世代で照合し、入力差替えや取消後に古い結果を混在させない。解析は協調yield・30秒の安全上限と終了待ち最大1秒を共用する。元データやパラメータを黙って縮小しない。IGTAの原典由来・補完・未確認事項は [照合表](algorithms/igta-conformance.md) を維持する。

## テスト

作業ルートで実行する。

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:subpath
```

`check` は型検査・Vitest・本番ビルド。E2Eは本番ビルドを配信し、Worker・出力・再読込を確認する。subpathは `/test-repo/` 配下を確認する。既存のBraveを使う例:

```sh
DSM_BROWSER_EXECUTABLE='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run test:e2e
DSM_BROWSER_EXECUTABLE='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run test:subpath
```

通常E2EではIGTA／M6の長時間ベンチマークをスキップする。測定コマンド・環境・結果は [性能測定](benchmarks.md) に集約する。新しい機能検証は `docs/validation.md`、残す測定JSONは `docs/benchmarks/data/`、必要な画面記録は `docs/screenshots/` に保存する。再生成可能な出力は `test-results/` に作られ、Git管理対象外。

履歴記録は乱数や評価順を変更しない。既存の固定fixtureを、仕様変更の理由なく更新しない。時間・取消による途中終了は完了した固定予算の同seed再現と区別する。

## 配信と公開準備

GitHubの実workflow実行・公開URLは未確認。外部公開は行っていない。`.github/workflows/validate.yml` が検証、`pages.yml` が配信を担う。

1. 公開先リポジトリを決め、Settings → PagesのSourceをGitHub Actionsにする。
2. リポジトリ変数 `DSM_BASE_PATH` を、ユーザーサイト／独自ドメインなら `/`、プロジェクトサイトなら `/repository-name/` に設定する。
3. 公開内容を確認して `DSM_PAGES_ENABLED=true` を設定し、mainへのpushまたは手動workflowを実行する。
4. Actionsの検証・deploy成功後、公開URLで取込・Worker・保存・オフラインHTMLを確認する。

ローカルのビルド先を変える例:

```sh
DSM_BASE_PATH=/repository-name/ npm run build
```

配布対象は `dist/`。`trash/` は含まない。原論文PDF・参考ノートブックのローカルファイルは削除済みで、出典記録は `docs/algorithms/` に保持する。プロジェクトURLのパスをコードへ散在させず、base設定を使う。

## 文書の更新

利用手順は [user-guide.md](user-guide.md) の1冊を更新する。開発手順と依存関係は本書、検証は [validation.md](validation.md) に追記する。版ごとのガイドや案内ページを増やさない。過去の証拠は [検証履歴](validation.md#検証履歴) で現在の状態と区別し、設計判断のD番号を維持する。仕様の正本は `docs/SPECIFICATION.md` と `docs/IGTA_ALGORITHM_SPEC.md`。文書移動時は相対リンクと出典JSONのパス・SHA-256を確認する。仕様全文のfingerprintがある場合は、本文・リンク変更も記録へ反映する。

<a id="dependencies"></a>

## 依存関係とライセンス一覧

更新: 2026-11-16。直接依存は固定指定、間接依存・取得URL・integrityはpackage-lock.jsonに記録。操作中のCDN読込はなく、本番成果物に同梱する。

### 直接依存

| パッケージ | 版 | 用途 | ライセンス |
| --- | --- | --- | --- |
| [fflate](https://www.npmjs.com/package/fflate/v/0.8.3) | 0.8.3 | XLSXの実展開量制限・無圧縮再パック | MIT |
| [papaparse](https://www.npmjs.com/package/papaparse/v/5.5.3) | 5.5.3 | 引用符・改行・文字列を保持するCSV解析 | MIT |
| [react](https://www.npmjs.com/package/react/v/19.3.1) | 19.3.1 | UI | MIT |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.3.1) | 19.3.1 | UI描画・静的描画テスト | MIT |
| [xlsx](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) | 0.20.3 | XLSX取込・出力書式の技術検証 | Apache-2.0 |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test/v/1.56.1) | 1.56.1 | 本番ブラウザE2Eと性能測定 | Apache-2.0 |
| [@types/node](https://www.npmjs.com/package/@types/node/v/26.6.6) | 26.6.6 | Node型定義 | MIT |
| [@types/papaparse](https://www.npmjs.com/package/@types/papaparse/v/5.3.16) | 5.3.16 | CSV型定義 | MIT |
| [@types/react](https://www.npmjs.com/package/@types/react/v/19.3.0) | 19.3.0 | React型定義 | MIT |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom/v/19.3.0) | 19.3.0 | React DOM型定義 | MIT |
| [@vitejs/plugin-react](https://www.npmjs.com/package/@vitejs/plugin-react/v/6.3.0) | 6.3.0 | ViteのReact変換 | MIT |
| [fast-check](https://www.npmjs.com/package/fast-check/v/4.10.2) | 4.10.2 | 性質テスト | MIT |
| [typescript](https://www.npmjs.com/package/typescript/v/7.0.2) | 7.0.2 | 型検査 | Apache-2.0 |
| [vite](https://www.npmjs.com/package/vite/v/8.3.8) | 8.3.8 | 開発・静的ビルド | MIT |
| [vitest](https://www.npmjs.com/package/vitest/v/5.1.0) | 5.1.0 | 単体・性質テスト | MIT |

### M1の取得・選定根拠

- CSVは [Papa Parse公式仕様](https://www.papaparse.com/docs) に沿い、動的型変換を無効化しstepで上限を確認する。
- SheetJS CEは [公式インストール手順](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) が示す固定URL `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` を採用。npmレジストリの古いxlsxは使わない。
- SheetJS tarballのlockfile integrity: `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`。
- セル型・内部値・数式を [公式セルモデル](https://docs.sheetjs.com/docs/csf/cell/) に沿って区別する。
- 展開制限は [fflate公式API・ストリーム解凍](https://github.com/101arrowz/fflate) を使用。当初0.8.2の監査で報告されたZIP64に関する問題を修正版0.8.3へ更新。最終の `npm audit` は0件。
- Playwrightは1.56.1に固定。専用Chromium取得が停止したため既存Braveで検証した。最新版や全対象ブラウザの検証を意味しない。

<details>
<summary>lockfileに記録した全依存（記録時点）</summary>

### lockfileに記録した全依存

別OS向けoptional依存と入れ子の別版も含む。全行がこの端末に導入されたという意味ではない。

| パッケージ | 版 | ライセンス |
| --- | --- | --- |
| @emnapi/core | 2.0.0-beta.2 | MIT |
| @emnapi/runtime | 2.0.0-beta.2 | MIT |
| @emnapi/wasi-threads | 2.2.0 | MIT |
| @jridgewell/resolve-uri | 3.1.3 | MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @napi-rs/wasm-runtime | 1.2.6 | MIT |
| @oxc-project/types | 0.156.0 | MIT |
| @playwright/test | 1.56.1 | Apache-2.0 |
| @rolldown/binding-android-arm-eabi | 1.2.19 | MIT |
| @rolldown/binding-android-arm64 | 1.2.19 | MIT |
| @rolldown/binding-darwin-arm64 | 1.2.19 | MIT |
| @rolldown/binding-darwin-x64 | 1.2.19 | MIT |
| @rolldown/binding-freebsd-x64 | 1.2.19 | MIT |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.19 | MIT |
| @rolldown/binding-linux-arm64-gnu | 1.2.19 | MIT |
| @rolldown/binding-linux-arm64-musl | 1.2.19 | MIT |
| @rolldown/binding-linux-ppc64-gnu | 1.2.19 | MIT |
| @rolldown/binding-linux-s390x-gnu | 1.2.19 | MIT |
| @rolldown/binding-linux-x64-gnu | 1.2.19 | MIT |
| @rolldown/binding-linux-x64-musl | 1.2.19 | MIT |
| @rolldown/binding-openharmony-arm64 | 1.2.19 | MIT |
| @rolldown/binding-wasm32-wasi | 1.2.19 | MIT |
| @rolldown/binding-win32-arm64-msvc | 1.2.19 | MIT |
| @rolldown/binding-win32-x64-msvc | 1.2.19 | MIT |
| @rolldown/pluginutils | 1.1.1 | MIT |
| @tybys/wasm-util | 0.10.4 | MIT |
| @types/chai | 5.2.3 | MIT |
| @types/deep-eql | 4.0.2 | MIT |
| @types/estree | 1.0.10 | MIT |
| @types/node | 26.6.6 | MIT |
| @types/papaparse | 5.3.16 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @typescript/typescript-aix-ppc64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-darwin-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-darwin-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-freebsd-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-arm | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-loong64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-mips64el | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-ppc64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-riscv64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-s390x | 7.0.2 | Apache-2.0 |
| @typescript/typescript-linux-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-netbsd-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-openbsd-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-sunos-x64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-win32-arm64 | 7.0.2 | Apache-2.0 |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 |
| @vitejs/plugin-react | 6.3.0 | MIT |
| @vitest/mocker | 5.1.0 | MIT |
| @vitest/spy | 5.1.0 | MIT |
| assertion-error | 2.0.1 | MIT |
| chai | 6.3.0 | MIT |
| csstype | 3.2.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| es-module-lexer | 2.3.2 | MIT |
| estree-walker | 3.0.3 | MIT |
| expect-type | 1.4.0 | Apache-2.0 |
| fast-check | 4.10.2 | MIT |
| fdir | 6.5.0 | MIT |
| fflate | 0.8.3 | MIT |
| fsevents | 2.3.3 | MIT |
| lightningcss | 1.33.0 | MPL-2.0 |
| lightningcss-android-arm64 | 1.33.0 | MPL-2.0 |
| lightningcss-darwin-arm64 | 1.33.0 | MPL-2.0 |
| lightningcss-darwin-x64 | 1.33.0 | MPL-2.0 |
| lightningcss-freebsd-x64 | 1.33.0 | MPL-2.0 |
| lightningcss-linux-arm-gnueabihf | 1.33.0 | MPL-2.0 |
| lightningcss-linux-arm64-gnu | 1.33.0 | MPL-2.0 |
| lightningcss-linux-arm64-musl | 1.33.0 | MPL-2.0 |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0 |
| lightningcss-win32-arm64-msvc | 1.33.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 |
| magic-string | 1.4.5 | MIT |
| nanoid | 3.3.20 | MIT |
| obug | 3.0.0 | MIT |
| papaparse | 5.5.3 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| playwright | 1.56.1 | Apache-2.0 |
| playwright-core | 1.56.1 | Apache-2.0 |
| fsevents | 2.3.2 | MIT |
| postcss | 8.5.33 | MIT |
| pure-rand | 8.4.2 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| rolldown | 1.2.19 | MIT |
| scheduler | 0.28.0 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| std-env | 4.3.0 | MIT |
| tinybench | 6.2.3 | MIT |
| tinyexec | 1.3.1 | MIT |
| tinyglobby | 0.2.17 | MIT |
| tslib | 2.9.1 | 0BSD |
| typescript | 7.0.2 | Apache-2.0 |
| undici-types | 8.9.0 | MIT |
| vite | 8.3.8 | MIT |
| vitest | 5.1.0 | MIT |
| why-is-node-running | 3.2.1 | MIT |
| xlsx | 0.20.3 | Apache-2.0 |

</details>

### 配布時の通知

ブラウザ成果物に含むReact・React DOM・scheduler・Papa Parse・fflate・SheetJSのライセンス本文を `public/THIRD_PARTY_NOTICES.txt` に同梱する。その他は開発依存。依存の利用条件の記録であり、プロジェクト自体の配布ライセンスを決定するものではない。

M3（v0.1.0）は追加の外部依存なし。HTML閲覧スクリプトはブラウザ標準APIのみで自己完結する。CIの外部Actionsはworkflow内の固定commit SHAで管理する。

M4（v0.2.0）も外部依存の追加なし。mulberry32、差分評価、MCL、集計はアプリ内で固定実装する。

M6（2026-11-18）は追加の外部依存なし。GA・制約・Tearingは既存domain・PRNG・Worker基盤を共用する。M5原典のコード・PDFは配布物へ含めない。

M5参照プロファイル（2026-11-19、v0.4.0）は追加の外部依存なし。ユーザー仕様に基づき独立実装し、論文PDF・Colab認証・第三者ノートブックのコードをアプリbuildへ同梱しない。著者MATLABとの一致は未確認。
