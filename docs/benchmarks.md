# 基準環境と性能測定

記録日: 2026-11-16（日本時間）

## 基準端末

- MacBook Pro（Mac17,9）、Apple M5 Pro、18コア、48GB RAM
- macOS / Darwin 27.2.0、arm64
- Node.js 26.13.1、npm 11.20.0
- テスト実行はVitestのNode環境。ブラウザの性能値とは区別する。

個体識別子・シリアル番号等は記録しない。

## ブラウザの検証対象

以下はM0時点の具体的な基準版。インストール・動作確認済みを意味しない。M1以降に実際に検証したパッチ版とOSを追記する。

| ブラウザ | 基準版 | M0時点の状況・根拠 |
| --- | --- | --- |
| Chrome | 157.0.8103.79（macOS） | 未実施。[公式2026-11-11リリース告知](https://chromereleases.googleblog.com/2026/11/stable-channel-update-for-desktop_01744469280.html) |
| Edge | 157.0.4341.60 | 未実施。[公式Stableリリースノート](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel) |
| Firefox | 160.0 | 未実施。[公式リリースノート](https://www.mozilla.org/en-US/firefox/160.0/releasenotes/) |
| Safari | 27.2 | アプリのバージョン情報から確認。操作権限がなく起動画面の確認は未実施 |

Viteのbuild.targetはChrome/Edge 120、Firefox 121、Safari 17相当の構文変換下限。上表の検証対象版や動作保証を表すものではない。

## M0の実測と限界

初回の合格実行では3テストファイル・67テスト、Vitestの報告所要時間211ms。Vite本番ビルドは178ms。これらは単回の開発基盤チェックで、アプリの性能保証や繰り返しベンチマークではない。

F01〜F10の行列と、n≤7のランダム性質テストを確認した。500要素の数値行列を作成できることは境界テストで確認済み。CSV/XLSX読込、Canvas描画、階層法、SCC、MCL等は未実装のため、性能は未測定。

M1以降は仕様12に従い、n=100/200/500、密度0/1%/10%/100%で、端末・OS・ブラウザ・データ生成seed・反復数・中央値・最大値を記録する。現時点の数値から他の手法の500要素対応を推測しない。
