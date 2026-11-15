import { fromRows, preprocess, processMetrics, structureMetrics } from '../domain';

const chain = fromRows([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
const modules = fromRows([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]]);

export function App() {
  const structure = structureMetrics(preprocess(modules).symmetric, [0, 0, 1, 1]);
  const process = processMetrics(preprocess(chain).directed);
  return (
    <main>
      <header>
        <a href="#main" className="brand" aria-label="DSM解析の概要へ">DSM <span>解析</span></a>
        <span className="badge">M0 · 基盤確認版</span>
      </header>
      <section id="main" className="intro">
        <p className="eyebrow">構造と工程を、同じ行列から。</p>
        <h1>つながりを読み解く<br />解析の土台を。</h1>
        <p>部品のまとまりと、工程の流れ。二つの解析に共通する計算基盤を準備しました。</p>
      </section>
      <div className="panels">
        <section className="panel" aria-labelledby="structure-title">
          <p className="eyebrow">01 · 構造</p>
          <h2 id="structure-title">部品・組織のまとまり</h2>
          <p>A・BとC・Dが、それぞれ強くつながる例。二つのグループに分けたときの値です。</p>
          <div className="groups" aria-label="グループ1はAとB、グループ2はCとD"><span>A · B</span><span>C · D</span></div>
          <dl><div><dt>総調整コスト（α=1）</dt><dd>{structure.coordinationCost}</dd></div><div><dt>グループ間の重み</dt><dd>{structure.externalWeight}</dd></div></dl>
        </section>
        <section className="panel" aria-labelledby="process-title">
          <p className="eyebrow">02 · 工程</p>
          <h2 id="process-title">タスクの依存と順序</h2>
          <p>BはAの情報を、CはBの情報を必要とする例。A・B・Cの順で評価した値です。</p>
          <div className="flow" aria-label="AからB、BからCへ情報を供給">A <span>→</span> B <span>→</span> C</div>
          <dl><div><dt>フィードバック重み</dt><dd>{process.feedbackWeight}</dd></div><div><dt>全依存の重み</dt><dd>{process.totalWeight}</dd></div></dl>
        </section>
      </div>
      <aside className="note"><strong>現在は基盤の確認段階です。</strong><p>上の例は固定した所属と順序の計算結果です。ファイルの読み込みとDSM表示はM1、クラスタリングと工程の順序付けはM2で追加します。</p></aside>
      <footer>読み方：行の要素が、列の要素に依存します。入力データはブラウザ内で処理する設計です。</footer>
    </main>
  );
}
