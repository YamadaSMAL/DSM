# IGTA系 原典照合表（M5）

更新: 2026-11-17（日本時間）。状態: **研究ゲート未通過、M5未完了**。アプリはv0.2.0のまま。IGTA+／IGTA++／G-IGTAの実行IDを登録しない。以下の数式検証は探索アルゴリズムの準拠認定ではない。

## 1. 出典・版・取得範囲

| 記号 | 出典 | 参照範囲・取得状態 |
| --- | --- | --- |
| P12 | Fredrik Börjesson, Katja Hölttä-Otto (2012), *Improved Clustering Algorithm for Design Structure Matrix*, DOI [10.1115/DETC2012-70076](https://doi.org/10.1115/DETC2012-70076), ASME proceedings vol.3 pp.921–930 | [Aalto書誌](https://research.aalto.fi/en/publications/improved-clustering-algorithm-for-design-structure-matrix/)で題名・著者・年・DOIを確認。本文は下記T12の収録稿で照合。出版社最終版との版差は未確認。ポータルのイベント年と出版年には不整合があるため、イベント欄を根拠に年を変更しない。 |
| T12 | Fredrik Börjesson (2012), *Approaches to Modularity in Product Architecture*, KTH licentiate thesis, TRITA–MMK 2012:11, ISBN 978-91-7501-390-9, Paper D | [KTH公開PDF](https://kth.diva-portal.org/smash/get/diva2%3A530891/FULLTEXT02.pdf)の検索・テキスト抽出を確認。以下のページは**論文集の印刷ページ**（Paper D pp.95付近〜108）、PDFビューアのページ番号やASME版のpp.921–930ではない。Table 1 p.96、本文／Figure 1 p.98、Table 2 p.99、Table 3 p.100、Figure 2 p.101、結果pp.103–106、Matlab code案内p.108。完全PDFのローカル転送は時間切れ、図・表の画像による照合は未完了。 |
| P13 | Fredrik Börjesson, Ulf Sellgren (2013), *Fast Hybrid Genetic Clustering Algorithm for Design Structure Matrix*, DOI [10.1115/DETC2013-12041](https://doi.org/10.1115/DETC2013-12041) | [著者公開情報](https://www.researchgate.net/publication/267490581_Fast_Hybrid_Genetic_Clustering_Algorithm_for_Design_Structure_Matrix)で書誌・要旨と図キャプションを確認。全文リンクは取得失敗。本文ページ・式・全操作は**未確認**。 |
| W18 | David Williamsson, Ulf Sellgren, Anders Söderberg (2018), *The hunt for proper relation weights in product architecture clustering*, NordDesign 2018 | [公開論文](https://www.designsociety.org/download-publication/40949/The%2Bhunt%2Bfor%2Bproper%2Brelation%2Bweights%2Bin%2Bproduct%2Barchitecture%2Bclustering)、§3.1、PDF p.6、参考文献p.13。適用研究の一次資料。P13のアルゴリズム仕様を代替しない。 |
| C01 | Ronnie E. Thebeau, MATLAB macro, ファイル内日付December 2000、配布アーカイブ内2001年版 | [DSM Web配布ページ](https://dsmweb.org/matlab-macro-for-clustering-dsms/)、[ZIP](https://dsmweb.org/wp-content/uploads/2019/05/dsm_matlab.zip)を取得・展開し、`bid.m`、`Coord_Cost.m`、`Cluster.m`を読んだ。IGTAのコードであり、IGTA+のコードではない。 |
| T01 | Ronnie E. Thebeau (2001), *Knowledge Management of System Interfaces and Interactions for Product Development Processes*, MIT master's thesis | C01配布ページの[論文リンク](https://dsmweb.org/wp-content/uploads/2019/05/msc_thebeau.pdf)へ到達（151ページ）。今回本文OCR／該当ページの照合は未完了。書誌だけで操作を確定しない。 |

取得範囲とC01のSHA-256は [igta-sources.json](igta-sources.json)。外部ソースの原文・コード・図をリポジトリへ再配布せず、出典・数学的操作・自作検証例のみ記録する。T12のMatlabコード案内は著者への連絡を求めているが、連絡は送っていない。

## 2. 名称の照合

| 呼称 | 根拠 | 確定範囲 |
| --- | --- | --- |
| IGTA | T12 Table 1、C01 | Idicula–Gutierrez–Thebeau系。Thebeauコードは重複所属を許す。単純な排他所属ベクトルだけで元コード全体を表現できない。 |
| IGTA-plus／IGTA+ | T12 Table 1とpp.100–101 | IGTAへのSMAとITC。SMAは最高bid同点群から一つをランダムに選ぶ。ITCは未試行要素のリストを使い、移動時にリセットする。 |
| G-IGTA | P13の図キャプション | P13は要旨でGA・MDL・知識を使うヒューリスティックを説明し、図にG-IGTA表記がある。本文未取得なので正式な定義・全手順は確定しない。 |
| IGTA++ | W18 §3.1 | P13を出典にこの呼称で実行したことは確認できる。しかしP13本文のどの手法・目的・パラメータに対応するかは未確定。**G-IGTA＝IGTA++とも、IGTA+の単なる高速版とも断定しない。** |
| R-IGTA | T12用語説明・本文 | Reangularityを含む拡張。今回のIGTA+／IGTA++候補の代用にしない。 |

## 3. 目的関数の照合と実行可能な検証

### 3.1 IGTA+のTable 3

T12 p.100 Table 3、式1〜4。Xは入力DSM、Mはクラスタ×要素の0/1所属行列で、各列に1が一つ。s_kは群の規模、Nは要素数、pはpowcc。

```text
IO = M X Mᵀ
intra = Σ_k IO[k,k] s_k^p
extra = (Σ_a Σ_b IO[a,b] − Σ_k IO[k,k]) N^p
TotalCost = intra + extra
```

全行列を集計するため、非対称Xを入力しても両方向の値が反映される。単独の上三角やmean Sの値をそのまま代入しない。

Table 3の表記を文字どおり計算するとXの対角もIO内へ入る。一方C01の`Coord_Cost.m:122–144`はj>iのペアを使い対角を除く。配布ページの入力説明は対角1。この差を勝手に吸収して「原典と同じ」と説明しない。T12の実際のコードで対角を事前に零へ変換しているか、収録稿と最終稿で式が変更されたかを確認する必要がある。

研究用 `igtaPlusTable3Cost` はTable 3を文字どおり計算し、対角の暗黙除去をしない。extraは数値安定化のためIOの非対角和を直接足す。`thebeauExclusiveCost` はC01の排他所属の場合だけを独立したペア式で計算する。重複所属時の行列拡大は実装していない。

### 3.2 既存のC_coordとの関係（導出）

既存アプリは零対角Dから `S[i,j]=(D[i,j]+D[j,i])/2` を作り、i<jを一度だけ数える。同じ排他所属・指数pなら、上のTable 3とC01のペア式はいずれも次の関係になる。

```text
TotalCost(D) = 2 × C_coord(mean S)
```

これは式から導出した関係で、名称の同一性を意味しない。非ゼロ対角、重複所属、MDLへは一般化しない。将来は原典用目的値・版と共通比較用指標・版を区別し、既存のcoordinationCostや保存済みM4結果を変更しない。

手計算例（自作で、原典のベンチマークではない）:

```text
X = [[0,5,1], [2,0,3], [4,0,0]], 所属={0,1},{2}, p=1
IO = [[7,4], [4,0]], intra=14, extra=24, TotalCost=38
mean SでのアプリC_coord=19
対角を各1にするとTable 3=43、C01の排他ペア式=38
```

### 3.3 MDL（P13）

要旨からMDLの採用は確認したが、完全式、logの底、符号化する対象、余剰／不足辺、重複、重みの扱い、係数と既定値は未確認。別文献のMDL式やアプリのC_coordを代入しない。MDL実装はない。

## 4. 状態・探索操作の照合

| 項目 | IGTA/C01で確認した内容 | IGTA+/P13へ残る確認 |
| --- | --- | --- |
| 初期化 | `Cluster.m:92–137`は単要素群から開始。現在解と最良解の変数を持つ。 | T12 Figure 1/2とIGTA+コードで初期化・外側再開を照合する。P13は未確認。 |
| bid | `bid.m:60–83`。選択要素xを除く群kへの入出力和w_kを使い、正の結合があるとき `w_k^pow_dep / s_k^pow_bid`。規模は移動前。満杯群のbidは0。 | IGTA+の同点処理以外の変更、現在群を候補から外す順序、空群・新群をどう扱うかを確認。 |
| 最良／第2bid | `Cluster.m:191–212`。第2は最高値と異なるbidの最大値（順位2位の要素ではない）。乱数整数0で切替。 | IGTA+でもこの規則・確率が維持されているか。最高値だけの場合や第2bid=0時の挙動。 |
| 所属・同点 | C01は複数群への所属を許す。T12 SMAは最高bid同点群から一群をランダム選択。 | 第2bid選択時の同点、現在所属との同点、乱数の消費順と一様性の具体化。 |
| 受理 | `Cluster.m:226–256`は現在コスト以下を受理し、それ以外も1/rand_acceptで受理し得る。 | T12 Figure 1/2とIGTA+実装で、比較先が現在値か最良値か、同値、無条件移動、候補リスト更新の分岐を照合。 |
| 削除 | C01は`Delete_Clusters.m`を呼ぶ。重複所属と重複群削除がある。 | 排他化したIGTA+の空群削除と番号付けの操作を確認。 |
| ITC | T12 pp.100–101本文は試行済み要素を候補リストから除き、空で終了、移動時にリセット。 | 受理された同所属・同値が「移動」に当たるか、ランダム悪化と外側再開の関係、max_repeat・最良保持の厳密な分岐。 |
| GA・ヒューリスティック | C01はGAではない。P13の要旨はGAと知識ヒューリスティックを扱う。 | 染色体、個体数、選択、交叉、突然変異、エリート、ヒューリスティックの適用順、停止条件の全てが未確認。M6の汎用GA設定で補わない。 |
| 乱数・予算 | C01はMatlab randを使う。取得した版ではrand_bid/rand_acceptの判定整数は0。 | ブラウザのmulberry32・評価予算・安全取消はアプリ側変更。原典の乱数列や確率的最終所属と一致したとは言わない。 |

bidの計算だけを研究用 `thebeauBids` で検証した。入出力和、移動前規模、自己成分除外、満杯、零結合をテストする。勝者・第2bid・受理・ITCを組み合わせた探索は未実装。指数0〜4、非負有限値、排他所属、規模上限1〜Nに研究用の入力範囲を制限し、overflowは既存domainのDomainErrorで拒否する。この範囲制限は原典の全対応範囲の主張ではない。

## 5. 再現状況

| 対象 | 入力・参照結果 | 現状 |
| --- | --- | --- |
| T12 Dustbuster | 本文pp.103–106は57要素と10,000実行の実験、例としてTotalCost 178,127等を報告。図の所属と入力DSMの完全な数値・順序が必要。 | 正確な元DSM／実行パラメータ／コードを未取得。画像から推測して行列を作らず、報告値を本実装の出力と称さない。 |
| P13の4事例 | 要旨は4事例、図キャプションにP&W jet engine／G-IGTA。 | 全文・入力・参照目的値未取得。比較未実施。 |
| C01 | 配布ZIPにElevator_DSM等を含む。 | MATLAB/Octaveでの実行は未実施。ソースの読み取りと独立した小さな数式例だけで照合。C01の実行一致やIGTA+一致とは言わない。 |
| 自作数式例 | 上記3×3、零／単要素、300ランダムケース（seed=20261117） | Table 3対ペア式と2×C_coordを許容差1e-8で確認。大域最適性・確率的探索の参照再現ではない。 |

## 6. 研究ゲートの判定と再開に必要な資料

**未通過**。確認できた数式の部品を公開探索手法へ昇格させない。以下を満たした手法だけを個別に登録する。

1. P13全文（DETC2013-12041、式・表・図を含む）と、IGTA++という名称が指す実装／版の説明。G-IGTAとの対応を確定する。
2. P12最終稿の図表、およびIGTA+ MATLABコードか同等の操作仕様。対角処理、受理先、同値・第2bid同点、ITCのリセット、外側再開・最良保持を確定する。
3. 少なくとも一つの完全な入力DSM（要素順含む）、全パラメータ、参照所属・目的値。数式と操作単位のテストを先に通し、参照コードと比較する。
4. 原典目的と共通評価の分離、seed/PRNG版・制限・中断・保存検証の契約を定める。原典から変更するなら別IDと差分表を用意する。
5. 固定seed・複数seed品質・上限サイズの計測とブラウザ操作を行う。現時点でIGTA系の500要素対応や性能は主張しない。

原典へアクセスできなかったことを、論文が存在しない／一般に入手不能であるという意味にはしない。今回到達できた情報の範囲と、次に必要な具体的資料を区別した。M6へは自動的に進めない。
