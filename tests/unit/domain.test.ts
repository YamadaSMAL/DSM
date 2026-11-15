import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/cases.json';
import { feedbackOracle, permutations, provenance } from '../helpers';
import {
  CONVENTION, analysisInputHash, canonicalAnalysisInput, createMatrixData, dependencyEdges,
  DomainError, fromRows, identityOrder, invertOrder, permuteMatrix, preprocess,
  processMetrics, sha256Bytes, structureMetrics, transpose,
} from '../../src/domain';

describe('行列と入力方向', () => {
  it('BがAに依存するときA→Bを作り、対角は辺にしない', () => {
    expect(dependencyEdges(fromRows([[9, 0], [2, 8]]))).toEqual([{ from: 0, to: 1, weight: 2 }]);
  });
  it('逆規約は転置して正規化し、対角・原入力を保存する', () => {
    const rows = [[9, 2], [0, 8]];
    const matrix = createMatrixData(rows, { convention: 'row-supplies-column', provenance, labels: [' A ', 'B'] });
    expect([...matrix.values]).toEqual([9, 0, 2, 8]);
    expect(matrix.convention).toBe(CONVENTION);
    expect(matrix.elements).toEqual([
      { id: 'e000001', label: 'A', originalIndex: 0 },
      { id: 'e000002', label: 'B', originalIndex: 1 },
    ]);
    expect(rows).toEqual([[9, 2], [0, 8]]);
    expect(matrix.provenance.transformations[0]?.kind).toBe('transpose');
    expect(provenance.transformations).toHaveLength(0);
  });
  it('ラベルの001と重複を保持し、未指定時は生成する', () => {
    const matrix = createMatrixData([[0, 1], [0, 0]], { convention: CONVENTION, provenance, labels: ['001', '001'] });
    expect(matrix.elements.map((e) => e.label)).toEqual(['001', '001']);
    expect(createMatrixData([[0]], { convention: CONVENTION, provenance }).elements[0]?.label).toBe('要素1');
  });
  it.each([[], [[0, 1]], [[0], [0]], [[-1]], [[NaN]], [[Infinity]]].map((rows) => ({ rows })))('不正な行列を拒否: $rows', ({ rows }) => {
    expect(() => fromRows(rows)).toThrow(DomainError);
  });
  it('数値文字列の暗黙変換を拒否する', () => {
    expect(() => fromRows([['1' as unknown as number]])).toThrow(DomainError);
  });
  it('500要素を許可し、501要素を拒否する', () => {
    expect(fromRows(Array.from({ length: 500 }, () => Array<number>(500).fill(0))).n).toBe(500);
    expect(() => fromRows(Array.from({ length: 501 }, () => []))).toThrow(DomainError);
  });
  it.each([[''], [' '.repeat(2)], ['x'.repeat(201)], ['A', 'B']])('不正なラベルを拒否: %j', (...args) => {
    const labels = args as string[];
    expect(() => createMatrixData([[0]], { convention: CONVENTION, provenance, labels })).toThrow(DomainError);
  });
  it('不正なrevisionと元ハッシュを拒否する', () => {
    expect(() => createMatrixData([[0]], { convention: CONVENTION, provenance, revision: 0 })).toThrow(DomainError);
    expect(() => createMatrixData([[0]], { convention: CONVENTION, provenance: { ...provenance, sourceSha256: '' } })).toThrow(DomainError);
  });
  it('負の0を通常の0へ正規化する', () => {
    expect(Object.is(fromRows([[-0]]).values[0], -0)).toBe(false);
  });
});

describe('解析前処理', () => {
  it('元の対角と重みを変えずに閾値→二値化→対称化する', () => {
    const matrix = fromRows([[9, 0.5], [2, 8]]);
    const { directed, symmetric, transformations } = preprocess(matrix, { threshold: 0.5, binary: true });
    expect([...matrix.values]).toEqual([9, 0.5, 2, 8]);
    expect([...directed.values]).toEqual([0, 0, 1, 0]);
    expect([...symmetric.values]).toEqual([0, 0.5, 0.5, 0]);
    expect(transformations.map((t) => [t.kind, t.affectedCells])).toEqual([
      ['exclude-diagonal', 2], ['threshold', 1], ['binary', 1], ['symmetric-mean', 2],
    ]);
    directed.values[2] = 20;
    expect(symmetric.values[1]).toBe(0.5);
    expect(matrix.values[2]).toBe(2);
  });
  it('meanで対称重みを倍増せず、最大値と微小値でも有限に保つ', () => {
    const max = Number.MAX_VALUE;
    expect(preprocess(fromRows([[0, max], [max, 0]])).symmetric.values[1]).toBe(max);
    expect(preprocess(fromRows([[0, Number.MIN_VALUE], [Number.MIN_VALUE, 0]])).symmetric.values[1]).toBe(Number.MIN_VALUE);
  });
  it.each([-1, Infinity, NaN])('不正閾値を拒否: %s', (threshold) => {
    expect(() => preprocess(fromRows([[0]]), { threshold })).toThrow(DomainError);
  });
});

describe('表示順と逆変換', () => {
  it('行と列の両方へ同じ置換を適用し、逆置換で完全復元する', () => {
    const matrix = fromRows([[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
    const order = [2, 0, 1];
    expect([...permuteMatrix(matrix, order).values]).toEqual([8, 6, 7, 2, 0, 1, 5, 3, 4]);
    expect(invertOrder(order)).toEqual([1, 2, 0]);
    expect(permuteMatrix(permuteMatrix(matrix, order), invertOrder(order))).toEqual(matrix);
    expect(identityOrder(3)).toEqual([0, 1, 2]);
  });
  it.each([[0, 0], [0], [0, 2], [-1, 0], [0.5, 1], [NaN, 1]])('不正な順列を拒否: %j', (...order) => {
    expect(() => permuteMatrix(fromRows([[0, 1], [2, 0]]), order)).toThrow(DomainError);
  });
});

describe('手計算した指標', () => {
  it('F03: A/B/C順のフィードバック0、逆順は2', () => {
    const { directed } = preprocess(fromRows(fixtures[2]!.rows));
    expect(processMetrics(directed).feedbackWeight).toBe(0);
    expect(processMetrics(directed, [2, 1, 0])).toMatchObject({ feedbackWeight: 2, feedbackCount: 2, feedbackRatio: 1 });
  });
  it('F07: 正しい二群は4、全一群／全単要素は8', () => {
    const { symmetric } = preprocess(fromRows(fixtures[6]!.rows));
    expect(structureMetrics(symmetric, [0, 0, 1, 1])).toMatchObject({
      coordinationCost: 4, totalWeight: 2, internalWeight: 2, externalWeight: 0, externalRatio: 0,
      clusterCount: 2, minClusterSize: 2, maxClusterSize: 2, meanClusterSize: 2,
    });
    expect(structureMetrics(symmetric, [0, 1, 2, 3]).coordinationCost).toBe(8);
    expect(structureMetrics(symmetric, [0, 0, 0, 0]).coordinationCost).toBe(8);
    expect(structureMetrics(symmetric, [7, 7, 99, 99]).coordinationCost).toBe(4);
    expect(structureMetrics(symmetric, [0, 0, 1, 1], 2).coordinationCost).toBe(8);
  });
  it('F08: 非対称性、依存方向、meanの1/2を維持する', () => {
    const { directed, symmetric } = preprocess(fromRows(fixtures[7]!.rows));
    expect([...directed.values]).toEqual([0, 0, 2, 0]);
    expect([...symmetric.values]).toEqual([0, 1, 1, 0]);
    expect(processMetrics(directed, [0, 1]).feedbackWeight).toBe(0);
    expect(processMetrics(directed, [1, 0]).feedbackWeight).toBe(2);
  });
  it('全0の比率は0ではなく未定義、単要素も有効', () => {
    const { directed, symmetric } = preprocess(fromRows([[0]]));
    expect(processMetrics(directed).feedbackRatio).toBeNull();
    expect(structureMetrics(symmetric, [0])).toMatchObject({ coordinationCost: 0, externalRatio: null, clusterCount: 1 });
  });
  it('対角付き行列と非対称Sを黙って評価しない', () => {
    expect(() => processMetrics(fromRows([[1]]))).toThrow(DomainError);
    expect(() => structureMetrics(fromRows([[0, 1], [0, 0]]), [0, 0])).toThrow(DomainError);
  });
  it.each([0, -1, 3.1, NaN, Infinity])('不正αを拒否: %s', (alpha) => {
    expect(() => structureMetrics(fromRows([[0]]), [0], alpha)).toThrow(DomainError);
  });
  it.each([[], [0, 1], [-1], [NaN], [1.5]])('不正所属を拒否: %j', (...membership) => {
    expect(() => structureMetrics(fromRows([[0]]), membership)).toThrow(DomainError);
  });
  it('有限の入力でも合計や規模コストのoverflowを拒否する', () => {
    const matrix = fromRows([[0, Number.MAX_VALUE], [Number.MAX_VALUE, 0]]);
    expect(() => processMetrics(matrix)).toThrow(/計算範囲/);
    expect(() => structureMetrics(matrix, [0, 0])).toThrow(/計算範囲/);
  });
});

describe('F01〜F10の全順列オラクル（最適化実装はM2以降）', () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: ${fixture.name}`, () => {
      const { directed } = preprocess(fromRows(fixture.rows));
      const orders = permutations(directed.n);
      const weights = orders.map((order) => {
        const oracle = feedbackOracle(directed, order);
        expect(processMetrics(directed, order).feedbackWeight).toBe(oracle);
        return oracle;
      });
      expect(Math.min(...weights)).toBe(fixture.expected.minFeedback);
    });
  }
});

describe('ハッシュと再現用直列化', () => {
  const make = () => createMatrixData([[0, 0], [2, 0]], { convention: CONVENTION, provenance, labels: ['A', 'B'] });
  it('既知のSHA-256と一致する', async () => {
    expect(await sha256Bytes(new TextEncoder().encode('abc').buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('同データ・既定条件は同じ、ラベル・値・前処理の変更は別になる', async () => {
    const data = make();
    const hash = await analysisInputHash(data);
    expect(await analysisInputHash(make(), { threshold: 0, binary: false })).toBe(hash);
    expect(await analysisInputHash({ ...data, revision: 2, provenance: { ...provenance, sourceName: 'renamed.xlsx' } })).toBe(hash);
    expect(await analysisInputHash(data, { threshold: 1 })).not.toBe(hash);
    expect(await analysisInputHash(data, { binary: true })).not.toBe(hash);
    expect(await analysisInputHash({ ...data, elements: data.elements.map((e) => ({ ...e, label: `${e.label}!` })) })).not.toBe(hash);
    expect(await analysisInputHash({ ...data, values: new Float64Array([0, 0, 3, 0]) })).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('オブジェクトのキー順に依存しない', () => {
    expect(canonicalAnalysisInput(make(), { binary: true, threshold: 2 })).toBe(canonicalAnalysisInput(make(), { threshold: 2, binary: true }));
  });
  it('非正規の方向や不正な要素情報を拒否する', () => {
    expect(() => canonicalAnalysisInput({ ...make(), elements: [] })).toThrow(DomainError);
  });
  it('転置を二回適用すると元へ戻る', () => {
    const matrix = fromRows([[0, 1], [2, 3]]);
    expect(transpose(transpose(matrix))).toEqual(matrix);
  });
});
