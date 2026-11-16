import { assertPermutation } from '../domain';
export interface ViewHistory { past: number[][]; order: number[]; future: number[][] }
export const initialView = (order: readonly number[]): ViewHistory => { assertPermutation(order, order.length); return { past: [], order: [...order], future: [] }; };
export function setOrder(view: ViewHistory, order: readonly number[]): ViewHistory {
  assertPermutation(order, view.order.length);
  if (view.order.every((i, p) => i === order[p])) return view;
  return { past: [...view.past.slice(-99), [...view.order]], order: [...order], future: [] };
}
export function moveElement(view: ViewHistory, from: number, to: number): ViewHistory {
  if (![from, to].every(i => Number.isInteger(i) && i >= 0 && i < view.order.length)) return view;
  const order = [...view.order]; order.splice(to, 0, order.splice(from, 1)[0]!); return setOrder(view, order);
}
export function undo(view: ViewHistory): ViewHistory { const order = view.past.at(-1); return order ? { past: view.past.slice(0, -1), order: [...order], future: [[...view.order], ...view.future] } : view; }
export function redo(view: ViewHistory): ViewHistory { const order = view.future[0]; return order ? { past: [...view.past, [...view.order]], order: [...order], future: view.future.slice(1) } : view; }
