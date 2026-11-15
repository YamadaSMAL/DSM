import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fromRows, invertOrder, permuteMatrix, preprocess, processMetrics, structureMetrics } from '../../src/domain';
import { feedbackOracle } from '../helpers';

const scenario = fc.integer({ min: 1, max: 7 }).chain((n) => fc.record({
  weights: fc.array(fc.integer({ min: 0, max: 800 }), { minLength: n * n, maxLength: n * n }),
  order: fc.shuffledSubarray(Array.from({ length: n }, (_, i) => i), { minLength: n, maxLength: n }),
  membership: fc.array(fc.integer({ min: 0, max: n - 1 }), { minLength: n, maxLength: n }),
}).map(({ weights, ...other }) => ({
  matrix: fromRows(Array.from({ length: n }, (_, i) => weights.slice(i * n, (i + 1) * n).map((w) => w / 8))),
  ...other,
})));
const options = { seed: 20261116, numRuns: 200 };

describe('数学的な不変条件（固定seed、各200例）', () => {
  it('逆置換で値・対角を含めて完全復元し、元の値を変えない', () => {
    fc.assert(fc.property(scenario, ({ matrix, order }) => {
      const before = [...matrix.values];
      const moved = permuteMatrix(matrix, order);
      expect(permuteMatrix(moved, invertOrder(order))).toEqual(matrix);
      expect([...matrix.values]).toEqual(before);
      expect(moved.values.reduce((a, b) => a + b, 0)).toBe(before.reduce((a, b) => a + b, 0));
    }), options);
  });
  it('Sは対称、対角0、無向総重みは有向の1/2', () => {
    fc.assert(fc.property(scenario, ({ matrix }) => {
      const { directed, symmetric } = preprocess(matrix);
      for (let i = 0; i < matrix.n; i++) {
        expect(symmetric.values[i * matrix.n + i]).toBe(0);
        for (let j = 0; j < matrix.n; j++) expect(symmetric.values[i * matrix.n + j]).toBe(symmetric.values[j * matrix.n + i]);
      }
      const allSeparate = Array.from({ length: matrix.n }, (_, i) => i);
      expect(structureMetrics(symmetric, allSeparate).totalWeight * 2).toBe(processMetrics(directed).totalWeight);
    }), options);
  });
  it('工程指標は独立した辺ベース評価と一致し、順序反転で全重みに補完する', () => {
    fc.assert(fc.property(scenario, ({ matrix, order }) => {
      const { directed } = preprocess(matrix);
      const result = processMetrics(directed, order);
      expect(result.feedbackWeight).toBe(feedbackOracle(directed, order));
      expect(result.feedbackWeight + processMetrics(directed, [...order].reverse()).feedbackWeight).toBe(result.totalWeight);
    }), options);
  });
  it('構造コストは無向辺と所属集合からの独立計算に一致する', () => {
    fc.assert(fc.property(scenario, ({ matrix, membership }) => {
      const { symmetric } = preprocess(matrix);
      let oracle = 0;
      // Count each directed cell with 1/2 weight; do not reuse production S/pair loops.
      matrix.values.forEach((weight, index) => {
        const i = Math.floor(index / matrix.n);
        const j = index % matrix.n;
        if (i !== j) {
          const scale = membership[i] === membership[j] ? membership.filter((c) => c === membership[i]).length : matrix.n;
          oracle += weight * scale / 2;
        }
      });
      expect(structureMetrics(symmetric, membership).coordinationCost).toBe(oracle);
    }), options);
  });
  it('同じ要素置換で行列と所属を動かしても構造指標は変わらない', () => {
    fc.assert(fc.property(scenario, ({ matrix, order, membership }) => {
      const { symmetric } = preprocess(matrix);
      expect(structureMetrics(permuteMatrix(symmetric, order), order.map((i) => membership[i]!))).toEqual(structureMetrics(symmetric, membership));
    }), options);
  });
  it('閾値を上げて重みが増えることはなく、二値化は対角0・他0/1', () => {
    fc.assert(fc.property(scenario, fc.integer({ min: 0, max: 100 }), ({ matrix }, threshold) => {
      const low = preprocess(matrix, { threshold });
      const high = preprocess(matrix, { threshold: threshold + 1 });
      high.directed.values.forEach((v, i) => expect(v).toBeLessThanOrEqual(low.directed.values[i]!));
      const binary = preprocess(matrix, { threshold, binary: true }).directed;
      binary.values.forEach((v) => expect([0, 1]).toContain(v));
    }), options);
  });
});
