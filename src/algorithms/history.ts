/** Observational only: never consumes random values or changes search decisions. */
export interface HistoryPoint { iteration:number; evaluations:number; value:number; best?:number }
export interface SearchHistory { version:'search-history-v1'; metric:'totalCost'|'mdl'|'coordinationCost'|'feedbackWeight'|'matrixDifference'; series:'current'|'candidate'|'difference'; points:HistoryPoint[]; samples:number; stride:number }
/** Power-of-two thinning preserves the first and final observation, at most 513 points.
 * Sampling can omit transient extrema. Search budgets and results are untouched. */
export function historyRecorder(metric:SearchHistory['metric'],series:SearchHistory['series']) {
 let points:{index:number;point:HistoryPoint}[]=[],samples=0,stride=1,last:HistoryPoint|undefined;
 return {
  add(point:HistoryPoint){const index=samples++;last={...point};if(index%stride===0)points.push({index,point:last});if(points.length>512){stride*=2;points=points.filter(p=>p.index%stride===0);}},
  finish():SearchHistory {const kept=points.map(p=>({...p.point}));if(last&&points.at(-1)?.index!==samples-1)kept.push({...last});return{version:'search-history-v1',metric,series,points:kept,samples,stride};}
 };
}
