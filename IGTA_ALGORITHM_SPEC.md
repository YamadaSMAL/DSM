# IGTA+ / IGTA++ アルゴリズム仕様

作成日: 2026-11-19
版: 1.0
対象: 排他的なDSMクラスタリング。画面、ファイル入出力、Web実装、実装工程は扱わない。

## 1. この文書の位置付け

IGTA+とIGTA++の目的関数、状態表現、探索、乱数、停止条件を説明し、実装者が操作を具体化できるようにする。

次のラベルを区別する。

- **【原典】**: 確認したPDFの本文・式・図・表に明記された事項。
- **【導出】**: 原典の式から数学的に導いた事項。
- **【補完】**: 原典だけでは一意に定まらない箇所について、本書が採用する実装規則。

本書の擬似コードは、補完規則を含めて一意に実行できる**参照プロファイル**である。著者のMATLABコードとの完全一致を認定したものではない。実装名は、例えば `igta-plus-paper-informed-v1` と `igta-pp-gigta-paper-informed-v1` とし、著者実装との照合前に「完全再現」と表示しない。

### 1.1 名称と一次資料

| 記号 | 資料 | この文書で使用する箇所 |
| --- | --- | --- |
| P12 | Börjesson, F.; Hölttä-Otto, K. (2012), *Improved Clustering Algorithm for Design Structure Matrix*, DETC2012-70076, DOI:10.1115/DETC2012-70076 | 提供された10ページの最終稿。pp.3–5、Figure 1、Table 3、Figure 2を中心に確認 |
| P13 | Börjesson, F.; Sellgren, U. (2013), *Fast Hybrid Genetic Clustering Algorithm for Design Structure Matrix*, DETC2013-12041, DOI:10.1115/DETC2013-12041 | pp.3–5、式(4)、(7)–(12)、Figures 3–6、p.6 Table 1 |
| P16 | Williamsson, D.; Sellgren, U. (2016), *An approach to integrated modularization*, Procedia CIRP 50, 613–617, DOI:10.1016/j.procir.2016.04.152 | p.613でIGTA++の出典を[4]とし、p.617の[4]がDETC2013-12041を指定 |

本書では **IGTA++ = P13のG-IGTAを指す後続文献での呼称**として扱う。P16の実行コードがP13から無変更だったことまで意味しない。IGTA+、G-IGTA、R-IGTAは区別する。

| 手法 | 探索の中心 | 原典で使う目的関数 | 主要な特徴 |
| --- | --- | --- | --- |
| IGTA+ / IGTA-plus | 1要素の所属移動による確率的局所探索 | TotalCost | 排他所属SMA、未試行リストITC |
| IGTA++ / G-IGTA | 二値染色体によるGA | MDL | 違法な所属をClusterBidで修正し、染色体へ反映 |

IGTA++を「IGTA+を単に高速化した同じ探索」として実装しない。目的関数も探索の状態表現も異なる。

## 2. 共通の入力・記号

### 2.1 入力DSM

`A ∈ R^(n×n)`、`n ≥ 1`。非負の有限数を使用する。0は相互作用なし、正値は強度。非対称DSMを許可し、自動でmean対称化しない。

【補完】解析時は `A[i,i]=0` とする。原入力に対角値がある場合は、対角除外を前処理として明示する。P12のTable 3を非ゼロ対角のまま計算すれば、対角値も群内コストへ加算されるためである。自己関係・期間・属性を相互作用として暗黙に解釈しない。

行が列に依存する規約を採用するが、以下はクラスタリングであり、タスクの先行順は求めない。両方向の結合を使う箇所も、まず非対称Aを保持してから集計する。

### 2.2 所属

`C_1,...,C_k`は空でないクラスタ、`c(i)`は要素iの所属、`s_g=|C_g|`。

合法な最終状態は次を満たす。

```text
全要素が所属する:      union_g C_g = {0,...,n-1}
所属は排他的:          C_g ∩ C_h = empty  (g != h)
空クラスタを含まない:  s_g >= 1
```

所属行列は `M[g,i]=1` iff `i ∈ C_g`、それ以外0。合法状態では各列の和は1。IGTA++の交叉・突然変異直後はこの条件を満たさないことがある。

### 2.3 乱数と同点

【補完】すべてのランダム操作はseed付きPRNGを引数として受け取る。`U()`は `[0,1)` の一様乱数、候補集合からの選択も一様とする。集合を元indexまたは固定の群スロット順で列挙してから乱数を使う。乱数方式・版・seedが同じとき、同じ操作列を得られるようにする。

本プロファイルの同点は、計算済みの値の厳密な等値で判定する。許容差を使う実装は別の比較規則として記録する。単に「二番目の要素」を第二bidとみなさない。

## 3. ClusterBidの計算と役割

### 3.1 採用する形

要素eとクラスタgの結合を

```text
w(g,e) = sum_{j in C_g, j != e} (A[e,j] + A[j,e])
```

とする。結合の強さを増幅し、大きい群を抑制するbidの形は

```text
bid(g,e) = w(g,e)^a / s_g^b
```

である。

P12はClusterBidの概念を説明するが、完全な計算式や全パラメータを再掲せず、Thebeauの研究を参照する。P13の式(12A/B)は、結合和を4乗し、クラスタ規模で割る具体例を示す。

【補完】本プロファイルは **a=4、b=1** を採用する。これをP12に明記された普遍的既定値とは扱わない。別指数を使う場合は条件を記録する。

### 3.2 IGTA+とIGTA++での規模の違い

- **IGTA+の移動提案【補完】**: 移動前の群からbidを計算する。現在群も候補に含み、現在群の `s_g` はeを含む。分子からだけ自己成分を除く。
- **IGTA++の合法化【原典・補完】**: 問題の要素eを群からいったん取り外した状態で、候補群との結合を評価する。分母も取り外し後の規模。P13 Figure 5はこの中間状態を示す。候補の具体的範囲は7章で固定する。

両者へ同じ補助関数を使う場合でも、群の状態と規模がどの時点のものかを渡し分ける。

### 3.3 数値計算

空群にはこの式を適用しない。結合0のbidは0。overflowを避ける場合、正のbidは `a*log(w)-b*log(s)` で比較できる。ただし同点の扱いが通常のべき乗評価と変わり得るので、使用方式を固定する。

ClusterBidは**移動先・修正先を決めるヒューリスティック**であり、TotalCostやMDLの代わりの最終目的関数ではない。bidが最大になる移動が、目的関数を必ず改善するとは限らない。

## 4. IGTA+の目的関数

### 4.1 Table 3の行列式【原典】

`p = powcc`、`IO = M A M^T` とする。IOはクラスタ間の相互作用を集約した行列。

```text
IO_intra = sum_g IO[g,g] * s_g^p
IO_extra = (sum_g sum_h IO[g,h] - sum_g IO[g,g]) * n^p
TotalCost = IO_intra + IO_extra
```

最小化する。数値計算では、`IO_extra`を差し算で求めず、`sum_{g!=h} IO[g,h] * n^p` と直接計算してよい。

### 4.2 等価な要素ペア式【導出】

零対角・排他所属なら、次と等価。

```text
TotalCost = sum_{i<j} (A[i,j]+A[j,i]) * scale(i,j)

scale(i,j) = s_c(i)^p   if c(i)=c(j)
             n^p        otherwise
```

これは「有向セルをすべて集計する」式であり、対称入力でも上三角だけの重みをそのまま使わない。既存のmean対称化DSM `S=(A+A^T)/2` をi<jで一度だけ数えるコストとは、同じpなら **TotalCost = 2 * C_coord(S)** になる。共通比較指標と原典目的値の数値を混同しない。

非ゼロ対角の場合の追加項は `sum_i A[i,i] * s_c(i)^p`。対角を無視するペア式とTable 3が一致するのは、対角除外後である。

### 4.3 pと入力スケール

【補完】pは明示パラメータとし、`p>0` の有限数を要求する。説明用・参照プロファイルの初期値はp=1。論文事例の報告値を再現する際は、pを含む実際の条件を別途確認する。

【導出】A全体を同じ正数倍にしても、TotalCostの大小関係とbidの順位は数学的には変わらない。min-max正規化や閾値による辺削除は、一般にこの性質と異なり結果を変えるため、IGTA+へ黙って追加しない。

## 5. IGTA+の探索

### 5.1 SMA【原典】

最高bidの群が複数あっても、要素を複数群へ割り当てない。最高値を持つ群から一つをランダムに選択する。これがSuppressing Multicluster Allocation。合法な所属に対し、4章の集約式でコストを計算する。

### 5.2 移動先と確率的受理

P12 Figure 1は二つの乱数を使う。

1. 確率 `1/N_b` で第二bid、残りで最高bidを選ぶ。
2. 確率 `1/N_a` で移動を無条件に行い、それ以外ではコスト改善を判定する。

ここで `N_b` と `N_a` は原図のN・Mを区別して書き直した制御値であり、要素数nや所属行列Mとは別。

**原典の解釈が残る点**:

- Figure 1の比較先は `BestCost` と記されているが、Figure 2の注記は新旧コストの比較を述べる。現在状態と全履歴最良状態のどちらを指すかは、これだけでは確定しない。
- Figure 1の無条件移動枝は、通常のコスト算出とBestCost更新を通らない。
- Figure 1の末尾のStableのyes/no表示は、通常期待する停止方向と整合しないように見える。停止はFigure 2とITC本文を優先して解釈する。

【補完】本プロファイルでは、**現在状態のコストを受理判定に使い、全履歴最良は別に保存**する。無条件移動でも候補コストを計算し、最良保存を省略しない。この選択は実行可能な実装規則であり、著者コードとの一致確認ではない。

### 5.3 移動提案の補完規則

本プロファイルは以下を固定する。

| 項目 | 採用規則【補完】 |
| --- | --- |
| 初期所属 | 各要素を単独の群へ置く |
| 候補 | 現在の空でない全群。現在群を含む |
| 第二bid | 最高値より厳密に小さいbidのうち最大の値 |
| 第二bidが存在しない | 最高bidへ戻す |
| 同じbidの群 | 対象bidを持つ群から一様に一群を選ぶ |
| 全bidが0 | 移動提案なし。IGTA++の最大群への割当て規則を流用しない |
| 現在群を選んだ | 所属変化なし。候補リストからの除去は有効 |
| 移動後の空群 | 削除する |
| 新群の生成 | この参照プロファイルでは行わない |
| 等コストの通常移動 | 受理しない。無条件移動枝なら受理し得る |

新群を生成しないため、本プロファイルでは一実行中の群数は増えない。後から分裂・新規群生成を追加する場合は、探索空間が変わる拡張として扱う。

### 5.4 ITCとリセット条件

【原典】未試行の要素リストUを持つ。そこから要素をランダムに選び、試すたびに除く。Uが空になれば終了する。

リセット条件には表現の違いがある。

- P12 p.4本文: 移動があればリストをリセットする。
- P12 Figure 2の注記: 新TotalCostが旧TotalCostより良い場合にchangeを増やし、change>0ならリセットする。

【補完】本プロファイルはFigure 2の注記を採用し、**受理した移動が直前の現在コストを厳密に改善した場合だけUを全要素へ戻す**。同じ所属への選択、拒否、等値・悪化の無条件移動ではリセットしない。

悪化移動でも現在状態は変わるため、Uが空になったことを「その最終状態に対する全近傍を調べた」と解釈しない。ITCは探索の停止規則であり、大域最適・局所最適の証明ではない。

本文を優先して「あらゆる受理済みの所属変更でリセット」する版も考えられるが、同一実装として混在させず、ITCの別モードとして記録する。

### 5.5 参照プロファイルの擬似コード

```text
input: A, p, N_b, N_a, seed, proposalLimit
require: N_b>=1, N_a>=1 (finite), proposalLimit>=1

current = {{0},{1},...,{n-1}}
currentCost = TotalCost(A,current,p)
best = copy(current)
bestCost = currentCost
U = [0,...,n-1]
proposals = 0

while U is not empty and proposals < proposalLimit:
    e = uniformly pick one element from U
    remove e from U
    proposals += 1
    calculate bids using current groups

    if every bid is zero:
        continue

    u1 = U01()
    if u1 < 1/N_b and a strictly lower second bid exists:
        selectedBid = second highest distinct bid
    else:
        selectedBid = highest bid
    destination = uniformly pick a group with selectedBid

    if e already belongs to destination:
        continue

    candidate = copy(current), moving only e to destination
    delete empty source group, if any
    candidateCost = TotalCost(A,candidate,p)
    oldCurrentCost = currentCost
    u2 = U01()

    if candidateCost < currentCost or u2 < 1/N_a:
        current = candidate
        currentCost = candidateCost
        if currentCost < bestCost:
            best = copy(current)
            bestCost = currentCost
        if currentCost < oldCurrentCost:
            U = [0,...,n-1]

return best, bestCost, stopReason, proposals
```

`U01()`は乱数関数で、未試行リストUとは別物。最良値同点なら先に得たbestを保持する。予算到達時は「ITC収束」と報告しない。乱数の生成位置は擬似コードどおりに固定する。

### 5.6 説明用の初期パラメータ【補完】

```text
p=1, bid exponent a=4, size exponent b=1
N_b=10, N_a=10
proposalLimit=100000
```

これらはP12の実験条件を復元した値ではない。1回の実行で最良解を保証しないため、異なるseedの独立実行を行い、各実行のbestのうち最小コストを選ぶ。

## 6. IGTA++ / G-IGTAの目的関数

### 6.1 目的と排他所属【原典】

P13は重複クラスタとbus moduleを扱わない。GAが生成する違法状態は合法化し、その後MDL（Minimum Description Length）を最小化する。

MDLは「クラスタ構造を記述する長さ」と「構造から外れるセルを記述する長さ」の和。群内が密、群外が疎というモデルからのずれを数える。

### 6.2 DSMの0〜1正規化

P13式(7):

```text
P[i,j] = (A[i,j] - d_min) / (d_max - d_min)
```

二値DSMならP=Aでよい。重み付きDSMではd_minとd_maxの選択範囲が計算へ影響する。

【補完】本プロファイルでは、まずAの対角を0にした後、**対角を含む全n²セル**からd_min/d_maxを取る。n>=2かつ正値があればd_min=0となり、P=A/d_max。正規化後も対角は評価対象外とする。

全0で分母が0になる場合はPを全0とする。n=1は単一群を返す特別扱いとする。一定の非ゼロ対角を使って正規化範囲を変えない。これは式(7)の退化ケースと対角の扱いを明確にするための補完である。

### 6.3 モデル記述長【原典・式(4)】

```text
L_model = (k + n - max_g s_g) * log2(n)
```

最大群の所属は他群を記述した残りとして分かるため、省略できる。原典で最適化から省いた定数項を勝手に戻さない。logの底は2。`ceil(log2(n))`へ置き換えない。

### 6.4 ミスマッチ【原典・式(8)/(9)、対角除外は補完】

```text
S1 = sum_{i!=j, c(i)=c(j)} (1 - P[i,j])
S2 = sum_{i!=j, c(i)!=c(j)} P[i,j]
```

- S1（Type I）: 同じ群なのに相互作用が弱い・存在しない。
- S2（Type II）: 別の群なのに相互作用が強い・存在する。

二値ならセル数、重み付きなら不一致の程度の和になる。非対称セルはそれぞれ数え、上三角だけへ減らさない。対角はP13のFigure 2で別扱いに描かれているが、式の添字に `i!=j` は明記されていないため、本プロファイルの除外規則として記録する。

### 6.5 最終MDL【原典・式(11)】

```text
MDL = (1-alpha-beta) * L_model
      + (alpha*S1 + beta*S2) * 2*log2(n)
```

P13 Table 1の条件は `alpha=0.1096, beta=0.8071`。したがってモデル項の係数は0.0833。これは特定の係数設定であり、すべてのDSMに最適な値ではない。

【補完】使用可能範囲を `alpha>=0, beta>=0, alpha+beta<=1` に制限する。原典で述べられた係数校正手続きを実装したと称さず、入力パラメータとして扱う。

IGTA+のTotalCost、既存アプリのC_coord、P16のPugh complexityを、MDLの代わりに使ってIGTA++と呼ばない。

## 7. IGTA++の染色体と合法化

### 7.1 二値の所属行列と符号化【原典】

群数上限を `c_max` とし、所属行列を `c_max × n` の0/1行列で持つ。ビット長は `L=c_max*n`。要素ごとの整数所属番号を直接交叉するGAとは異なる。

```text
horizontal: chromosome[g*n+i]       = M[g,i]
vertical:   chromosome[i*c_max+g]   = M[g,i]
```

P13 Table 1ではhorizontal。両方式は合法な状態の表現能力は同じでも、交叉と突然変異により探索経路が変わり得るので、実行中に切り替えない。

### 7.2 修正が必要な状態【原典】

1. 空群: 行に1がない。
2. 冗長群: 別の群と同一、または完全に別の群に含まれる。
3. 未所属要素: 列和が0。
4. 多重所属要素: 列和が2以上。

P13 Figure 6の順序は、空・冗長群の除去 → 列和が1でない要素の列挙 → リストのランダム化 → 要素ごとの修正。

### 7.3 空・冗長群の除去

【補完】同一群は小さいスロット番号を一つ残す。真部分集合の群は削除する。集合比較は削除前の状態に基づき、各同一集合の代表から包含関係を判定する。

染色体長をLに固定するため、削除した群の行は0にする。残った群のスロットは移動させない。群を毎回ソート・詰め直ししてから交叉する実装は、探索の性質を変える別の符号化規則になる。

包含された群の削除だけでは、その群の要素は上位集合に残る。ただし、その後の多重所属修正で空群が生じ得るので、最後にも空群を確認する。

### 7.4 違法要素の修正

【原典】問題の要素eをいったん既存群から取り外し、ClusterBidを使って一群へ割り当てる。最大bid同点はランダム。最大bidが0なら最大規模群へ割り当てる。問題の要素はランダム順で処理する。

【補完】実行を一意にするため以下を定める。

- リストは空・冗長群を除去した後の列和から一度作り、一様なFisher–Yates shuffleを行う。
- eをすべての群から取り外した後、**全ての空でない残存群**を候補にする。元の所属群だけに限定しない。
- bidは3章のa=4、b=1。結合の入力は6.2で得たPを使用する。零対角の非負AでP=A/d_maxなら、Aを使ったbidと順位は数学的に同じ。
- 正の最大bidが複数あれば、一様に一群を選ぶ。
- 全bidが0なら、最大規模の群を選ぶ。最大規模同点は一様選択。
- 候補群が一つもなければ、一番小さい空スロットにeの単要素群を作る。後続要素は通常規則で処理する。
- 既に列和が1の要素は修正しない。合法な要素を全て再配置する局所探索を追加しない。
- 一時的にeを孤立させても、`c_max`を超える新たな恒久群は追加しない。

最大bid0を「そのまま未所属」と処理しない。最大群へ入れる規則は、IGTA+の通常移動とは異なる。

### 7.5 評価時の染色体書き戻し【原典】

P13 Figure 6では、MDL計算は次の順序。

```text
decode -> legalize -> calculate MDL -> encode -> return
```

修正された所属行列を、**同じ符号化方式で染色体へ書き戻す**。MDLだけ修正後の群で測り、選択・交叉には元の違法染色体を使う実装にしない。

### 7.6 合法化の擬似コード

```text
function legalize(bits, P, c_max, rng):
    M = decode(bits)
    zero empty and redundant rows, preserving surviving slot positions
    illegal = [i for i in 0..n-1 if columnSum(M,i) != 1]
    shuffle illegal uniformly

    for e in illegal:
        set M[:,e] = 0
        candidates = nonempty rows of M
        if candidates is empty:
            set M[firstEmptySlot,e] = 1
            continue

        compute bid(g,e) from P and current candidate groups
        if maxBid > 0:
            g = uniform choice among max-bid groups
        else:
            g = uniform choice among largest candidate groups
        set M[g,e] = 1

    verify every column has exactly one 1
    verify number of nonempty rows <= c_max
    return encode(M), partitionFromNonemptyRows(M)
```

修正中の群規模と結合は前の要素の修正を反映する。全要素分のbidを最初に一括計算して固定しない。

## 8. IGTA++のGA探索

### 8.1 原典で分かる構成

P13はMitchellのsimple GAとSpeedyGAを基礎とする。Stochastic Universal Sampling（SUS）、Sigma Scaling、uniform crossover、ビット突然変異へ言及する。

【原典】突然変異率は **ビットごと0.00125**。交叉はuniformでp=0.5と記載する。ただし、ペアに交叉を適用する確率とビット交換の確率を分離した完全な設定表、集団初期化分布、エリートの詳細、sigma scalingの具体式は、このPDFだけでは揃わない。

【原典】Figure 6は、ランダム集団生成 → MDL評価 → 選択した染色体の交叉・突然変異 → 新集団への置換 → 反復 → 最良解表示、という構造。

### 8.2 参照GAの補完設定

以下は**全て【補完】**。著者のSpeedyGA設定を復元したものではない。

| 項目 | 本プロファイル |
| --- | --- |
| 群数上限 | `1<=c_max<=n` を明示指定。論文の57要素事例では14を使用しているが一般既定値にはしない |
| 個体数Q | 偶数、Q>=2。説明用初期値36 |
| 世代数G | 初期集団後に生成する後続集団数。説明用初期値36 |
| 初期集団 | 各ビットを独立なBernoulli(0.5)で作成してから合法化 |
| 適応度 | 8.3の最小化用sigma scaling |
| 選択 | SUSでQ個体を復元抽出し、親リストをshuffleして隣接ペアにする |
| 交叉 | 全ペアでuniform crossover。ビット交換maskはBernoulli(0.5) |
| 突然変異 | 各子・各ビットを独立確率0.00125で反転 |
| 評価 | 合法化と染色体書き戻しの後、MDL算出 |
| 世代交代 | Q個体全てを子で置換。エリート個体の強制コピーなし |
| 最良保持 | 世代とは別のarchiveで全履歴最良を保存 |
| 停止 | G世代完了、または明示した評価回数上限 |

Q≈GはP13で試した経験的な条件であり、一般的な最適設定ではない。P13の600回は独立実行回数を論じた例で、単一GAの世代数と混同しない。

### 8.3 最小化用sigma scaling【補完】

Q個体のMDLを `z_i`、平均をμ、母標準偏差をσとする。

```text
sigma = sqrt(sum_i (z_i-mu)^2 / Q)

if sigma > 0:
    fitness_i = max(0, 1 + (mu-z_i)/(2*sigma))
else:
    fitness_i = 1
```

値が小さいMDLほど高い適応度になる。全適応度が0になる数値異常には一様重みへ戻す。有限性を検査する。MDLそのものを「大きいほど良い」適応度として渡さない。

### 8.4 SUS【補完】

`F=sum_i fitness_i`、間隔 `step=F/Q`、開始位置 `start=U()*step` とする。累積適応度に対し `start+t*step (t=0,...,Q-1)` のQ点を置き、対応する個体を親として選ぶ。累積の境界上は次の区間へ進み、端点の丸めだけ最後の個体へ制限する。各個体は複数回選ばれ得る。

### 8.5 交叉と突然変異

親a,bと各ビットℓについて一様maskを生成する。

```text
mask[ell] ~ Bernoulli(0.5)
child1[ell] = a[ell] if mask[ell]=0 else b[ell]
child2[ell] = b[ell] if mask[ell]=0 else a[ell]
```

その後は親ペアごとに、子1の全ビットの突然変異 → 子1の合法化・MDL評価・最良解更新 → 子2の全ビットの突然変異 → 子2の合法化・MDL評価・最良解更新、の順に処理する。合法化も乱数を消費するため、子2の突然変異乱数を子1の評価前に先取りしない（§8.6を基準とする）。0.00125は要素ごと・群ごと・染色体ごとの確率ではない。初期集団と子に同じ合法化関数を用いる。

### 8.6 全体の擬似コード

```text
input: A, c_max, Q, G, alpha, beta, seed, evaluationLimit
P = normalize(A)
if n == 1:
    return {{0}}, MDL=0

population = Q independent random binary chromosomes of length c_max*n
archive = none
evaluations = 0

function evaluate(chromosome):
    repairedBits, partition = legalize(chromosome,P,c_max,rng)
    z = MDL(P,partition,alpha,beta)
    evaluations += 1
    update archive if z strictly improves the archive's z
    return repairedBits, partition, z

evaluate all initial individuals; keep repaired chromosomes
for generation = 1..G:
    fitness = sigmaScaledMinimization(population.MDL)
    parents = SUS(population,fitness,Q)
    shuffle parents
    newPopulation = []

    for each adjacent pair of parents:
        children = uniformCrossover(pair)
        for child in [child1,child2]:
            mutate every bit independently with probability 0.00125
            if evaluations == evaluationLimit:
                return archive with budget-stop status
            append evaluate(child) to newPopulation

    population = newPopulation

return archive with generation-limit status
```

【補完】`evaluationLimit>=Q` を要求する。G=0なら初期集団の最良を返す。別のseedで繰り返す場合は集団・archive・乱数を独立に初期化し、最終的に各実行の最良を比較する。

合法化は乱数を消費するが、合法化後の染色体をもう一度評価した場合は新たな違法要素がなく、所属は変わらない。違法染色体の評価を元ビット列だけでキャッシュすると、合法化乱数の挙動を変えるので、本プロファイルにはそのキャッシュを含めない。

## 9. 数式の確認用の小例

以下は本書が作った説明例であり、論文ベンチマークの再現ではない。

### 9.1 TotalCost

```text
A = [[0,5,1],
     [2,0,3],
     [4,0,0]]
clusters = {0,1}, {2}; p=1

IO = [[7,4],
      [4,0]]
IO_intra = 7*2 = 14
IO_extra = (4+4)*3 = 24
TotalCost = 38
```

mean対称化行列を上三角で一度だけ数えるC_coordは19。38と19を同じ目的値として出力しない。

### 9.2 ClusterBid

P13式(12A/B)の数値:

```text
group1: interaction sum=3, size=4 -> bid=3^4/4=20.25
group2: interaction sum=2, size=3 -> bid=2^4/3=16/3≈5.3333333333
```

group1へ修正する。割当てる要素を含めた移動後の規模5と4で分母を作らない。

### 9.3 MDL

```text
P = [[0,1,0,0],
     [1,0,0,0],
     [0,0,0,1],
     [0,0,1,0]]
alpha=0.1096, beta=0.8071, log2(4)=2
```

| 所属 | L_model | S1 | S2 | MDL |
| --- | ---: | ---: | ---: | ---: |
| {0,1}, {2,3} | 8 | 0 | 0 | 0.6664 |
| 全要素が一群 | 2 | 8 | 0 | 3.6738 |
| 全要素が単独 | 14 | 0 | 4 | 14.0798 |

この例では二群が最小。対角をS1へ誤って数えると、どの解でも余分な4を加えることになる。本プロファイルでは対角を数えない。

## 10. 実装で保持すべき区別

| 論点 | 守るべき意味 |
| --- | --- |
| 原典と補完 | 本文にない規則を「論文の既定値」と説明しない |
| 現在解と最良解 | 確率的悪化移動・世代交代で最良解を失わない |
| 目的関数 | IGTA+はTotalCost、IGTA++はMDL |
| 所属と並び順 | 群を表示順に並べる処理は探索の目的と別。工程順序を求めたと説明しない |
| 有向セルの集計 | 非対称行列を保持し、S1/S2を片三角にしない |
| 二値化と正規化 | IGTA++の0〜1正規化を、全正値を1にする二値化で代用しない |
| 違法状態と合法状態 | IGTA++は多重所属を中間的に作るが、MDL評価と返却時は排他的 |
| 合法化と局所最適化 | 違法要素の修正を、全要素への追加の局所探索へ拡張しない |
| 染色体書き戻し | 修正後の群構造を次の世代へ遺伝させる |
| 正常停止と上限停止 | ITC終了、世代終了、予算超過を区別する |
| 乱数再現と原典再現 | 同seedで同じ自作実装が再現することと、MATLAB原版の再現は別 |

原典との完全な一致を求める場合に残る主な照合点は、IGTA+の受理比較先・ITCリセット・bid候補・初期化と、IGTA++のSpeedyGA詳細設定・修正候補範囲・群スロット再配置・正規化範囲である。本書はそれらを曖昧なまま擬似コードへ残さず、参照プロファイルの選択として明記した。

## 11. 原典の参照位置とファイルの同定

### P12

- pp.1–2 Table 1: 用語、SMA、ITC、IGTA-plus。
- p.3 Figure 1: bid選択と確率的移動。Table 2: 元のTotalCost。
- p.4 Table 3: 集約行列IOによるTotalCost。SMAとITCの本文。
- p.5 Figure 2: 未試行リスト、抽出・削除、changeに基づくリセット。
- 提供ファイル: [DETC2012-70076_final-April16.pdf](DETC2012-70076_final-April16.pdf)
- SHA-256: `5e69db02864b75e48181e071132f51efa5d9096618b59df909d69d2123933c1a`

### P13

- p.3 §2.4–2.6、式(4)、(7)、(8): モデル、正規化、Type I。
- p.4 式(9)、(11): Type IIと非重複MDL。§3.2: GAと符号化、式(12A/B): bid具体例。
- p.5 Figure 5/6: 違法要素修正、MDL評価と染色体再符号化。
- p.6 Table 1: alpha/beta、horizontal、overlap/busなし。
- pp.8–9: 個体数・世代数・独立実行の議論。著者コードは要求に応じて提供との記載。
- 提供ファイル: [DETC2013-12041BorjessonSellgrenrevPA11.pdf](DETC2013-12041BorjessonSellgrenrevPA11.pdf)
- SHA-256: `232b6f61145a6212f0d6f7c49d212e9d6e5d352e5a4121c1e36217fd672a0046`

### P16

- p.613 Introductionとp.617 References [4]: IGTA++とDETC2013-12041の対応。
- DOI: [10.1016/j.procir.2016.04.152](https://doi.org/10.1016/j.procir.2016.04.152)

ページ番号は各提供PDFに印刷されたページによる。P12では大学学位論文収録版のpp.95–108ではなく、今回提供された10ページ稿を基準にした。
