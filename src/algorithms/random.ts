import { DomainError } from '../domain';
export const PRNG_VERSION='mulberry32-v1';
export function assertSeed(seed:number):void{if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new DomainError('INVALID_SEED','seedは0〜4294967295の整数が必要です。');}
export function mulberry32(seed:number):()=>number{assertSeed(seed);let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^(state>>>15),state|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function deriveSeeds(root:number,count:number):number[]{assertSeed(root);if(!Number.isInteger(count)||count<1||count>100)throw new DomainError('INVALID_REPETITIONS','反復数は1〜100が必要です。');return Array.from({length:count},(_,i)=>(root+Math.imul(i,0x9e3779b9))>>>0);}
