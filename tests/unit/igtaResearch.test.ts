import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fromRows, preprocess, structureMetrics } from '../../src/domain';
import { igtaPlusTable3Cost, thebeauBids, thebeauExclusiveCost } from '../../src/algorithms/research/igtaPrimitives';
import { algorithms, runAnalysis } from '../../src/algorithms/registry';
import { createMatrixData } from '../../src/domain';
import { provenance } from '../helpers';

describe('M5 research gate (not an algorithm implementation)', () => {
  it('Table 3のIO・内部・外部コストを非対称の手計算と照合する', () => {
    const d = fromRows([[0, 5, 1], [2, 0, 3], [4, 0, 0]]);
    const r = igtaPlusTable3Cost(d, [9, 9, 30]);
    expect(r.labels).toEqual([9, 30]); expect(r.sizes).toEqual([2, 1]);
    expect(Array.from(r.io)).toEqual([7, 4, 4, 0]);
    expect(r.intraCost).toBe(14); expect(r.extraCost).toBe(24); expect(r.totalCost).toBe(38);
    expect(thebeauExclusiveCost(d, [9, 9, 30])).toBe(38);
  });
  it('対角の扱いの差を消さず検出する', () => {
    const d = fromRows([[1, 5, 1], [2, 1, 3], [4, 0, 1]]);
    expect(igtaPlusTable3Cost(d, [0, 0, 1]).totalCost).toBe(43);
    expect(thebeauExclusiveCost(d, [0, 0, 1])).toBe(38);
  });
  it('零対角ではTable 3と参照ペア式が一致し、mean S指標の2倍になる', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 7 }).chain(n => fc.tuple(
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: n*n, maxLength: n*n }),
      fc.array(fc.integer({ min: 0, max: 4 }), { minLength: n, maxLength: n }),
      fc.constantFrom(0.5, 1, 2, 3)
    ).map(([v, m, p]) => ({ n, v, m, p }))), ({ n, v, m, p }) => {
      const d = fromRows(Array.from({ length: n }, (_, i) => v.slice(i*n, (i+1)*n).map((x,j) => i===j ? 0 : x/8)));
      const original = d.values.slice(), membership = [...m];
      const table = igtaPlusTable3Cost(d, m, p).totalCost;
      const oracle = thebeauExclusiveCost(d, m, p);
      const common = 2 * structureMetrics(preprocess(d).symmetric, m, p).coordinationCost;
      expect(table).toBeCloseTo(oracle, 8); expect(table).toBeCloseTo(common, 8);
      expect(d.values).toEqual(original); expect(m).toEqual(membership);
    }), { seed: 20261117, numRuns: 300 });
  });
  it('bidは入出力和・現在規模を使い、自己成分と満杯群を除く', () => {
    const d = fromRows([[999, 5, 1], [2, 999, 3], [4, 0, 999]]);
    // Element 0: current group {0,1}, in+out=7, size=2; other group {2}, in+out=5.
    expect(thebeauBids(d, [8, 8, 2], 0)).toEqual({ labels: [2, 8], bids: [625, 2401/2] });
    expect(thebeauBids(d, [8, 8, 2], 0, 4, 1, 2).bids).toEqual([625, 0]);
    expect(thebeauBids(d, [8, 8, 2], 0, 1, 0).bids).toEqual([5, 7]);
    expect(thebeauBids(fromRows([[1,0],[0,1]]), [0,1], 0, 0, 0).bids).toEqual([0,0]);
  });
  it('零行列・単要素を扱い、非有限値・不正所属・演算overflowを拒否する', () => {
    expect(igtaPlusTable3Cost(fromRows([[0]]), [0]).totalCost).toBe(0);
    expect(thebeauExclusiveCost(fromRows([[1]]), [0])).toBe(0);
    expect(thebeauBids(fromRows([[1]]), [0], 0).bids).toEqual([0]);
    expect(() => igtaPlusTable3Cost(fromRows([[0,1],[1,0]]), [0])).toThrow();
    expect(() => thebeauBids(fromRows([[0,1],[1,0]]), [0,0], 0, 4, 1, 1)).toThrow();
    expect(() => thebeauBids(fromRows([[0,1],[1,0]]), [0,1], 2)).toThrow();
    expect(() => igtaPlusTable3Cost(fromRows([[0]]), [-1])).toThrow();
    expect(() => igtaPlusTable3Cost(fromRows([[0]]), [0], NaN)).toThrow();
    expect(() => thebeauBids(fromRows([[0,1e100],[0,0]]), [0,1], 0)).toThrow();
    expect(() => igtaPlusTable3Cost(fromRows([[0,1e308],[1e308,0]]), [0,0])).toThrow();
  });
  it('著者実装の未検証IDを登録せず参照プロファイルを区別する', async () => {
    expect(algorithms.filter(a => /igta/i.test(a.id) && !a.id.endsWith('paper-informed-v1'))).toEqual([]);
    const source = createMatrixData([[0]], { convention: 'row-depends-on-column', provenance });
    await expect(runAnalysis(source, 'igta-pp-paper-unverified', {})).rejects.toThrow('登録されていません');
  });
});
