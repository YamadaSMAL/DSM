/** Research-only operations. Not an AlgorithmPlugin and not a public IGTA implementation.
 * Sources and unresolved conventions: docs/algorithms/igta-conformance.md.
 */
import { assertMatrix, DomainError, finiteResult, type DenseMatrix } from '../../domain';

function partition(matrix: DenseMatrix, membership: readonly number[]) {
  assertMatrix(matrix);
  if (membership.length !== matrix.n || membership.some(c => !Number.isSafeInteger(c) || c < 0)) {
    throw new DomainError('INVALID_MEMBERSHIP', '各要素に一つの非負整数の所属が必要です。');
  }
  const labels = [...new Set(membership)].sort((a, b) => a - b);
  const index = new Map(labels.map((label, i) => [label, i]));
  const groups = membership.map(c => index.get(c)!);
  const sizes = Array<number>(labels.length).fill(0);
  for (const group of groups) sizes[group]!++;
  return { labels, groups, sizes };
}
function exponent(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 4) {
    throw new DomainError('INVALID_PARAMETERS', '研究用の指数は0〜4の有限数に限定しています。');
  }
  return value;
}

/** Literal Table 3, Paper D (2012 thesis), including diagonal entries in M DSM M^T.
 * No implicit diagonal removal, averaging, or upper-triangle reduction.
 */
export function igtaPlusTable3Cost(matrix: DenseMatrix, membership: readonly number[], powCc = 1) {
  const { labels, groups, sizes } = partition(matrix, membership);
  exponent(powCc);
  const k = labels.length, io = new Float64Array(k * k);
  for (let i = 0; i < matrix.n; i++) for (let j = 0; j < matrix.n; j++) {
    const cell = groups[i]! * k + groups[j]!;
    io[cell] = finiteResult(io[cell]! + matrix.values[i * matrix.n + j]!);
  }
  let intraCost = 0, externalWeight = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    if (i === j) intraCost = finiteResult(intraCost + finiteResult(io[i * k + i]! * sizes[i]! ** powCc));
    else externalWeight = finiteResult(externalWeight + io[i * k + j]!);
  }
  // Sum off-diagonal IO directly rather than subtracting nearly equal totals.
  const extraCost = finiteResult(externalWeight * matrix.n ** powCc);
  return { labels, sizes, io, intraCost, extraCost, totalCost: finiteResult(intraCost + extraCost) };
}

/** Coord_Cost.m, exclusive-membership special case: j > i skips the diagonal.
 * This is not a replacement for the reference's overlapping-membership handling.
 */
export function thebeauExclusiveCost(matrix: DenseMatrix, membership: readonly number[], powCc = 1) {
  const { groups, sizes } = partition(matrix, membership);
  exponent(powCc);
  let cost = 0;
  for (let i = 0; i < matrix.n; i++) for (let j = i + 1; j < matrix.n; j++) {
    const scale = groups[i] === groups[j] ? sizes[groups[i]!]! : matrix.n;
    const weight = finiteResult(matrix.values[i * matrix.n + j]! + matrix.values[j * matrix.n + i]!);
    cost = finiteResult(cost + finiteResult(weight * scale ** powCc));
  }
  return cost;
}

/** bid.m: current cluster sizes, selected element excluded from in+out.
 * Only nonempty, exclusive groups; does not decide a winner, tie, move, or acceptance.
 */
export function thebeauBids(matrix: DenseMatrix, membership: readonly number[], element: number,
  powDep = 4, powBid = 1, maxClusterSize = matrix.n) {
  const { labels, groups, sizes } = partition(matrix, membership);
  exponent(powDep); exponent(powBid);
  if (!Number.isInteger(element) || element < 0 || element >= matrix.n ||
      !Number.isInteger(maxClusterSize) || maxClusterSize < 1 || maxClusterSize > matrix.n ||
      sizes.some(size => size > maxClusterSize)) {
    throw new DomainError('INVALID_PARAMETERS', '要素番号またはクラスタ規模が研究用の範囲外です。');
  }
  const interaction = Array<number>(labels.length).fill(0);
  for (let j = 0; j < matrix.n; j++) if (j !== element) {
    const g = groups[j]!;
    interaction[g] = finiteResult(interaction[g]! + finiteResult(matrix.values[j * matrix.n + element]! + matrix.values[element * matrix.n + j]!));
  }
  const bids = interaction.map((weight, g) => weight === 0 || sizes[g] === maxClusterSize ? 0 :
    finiteResult(finiteResult(weight ** powDep) / sizes[g]! ** powBid));
  return { labels, bids };
}
