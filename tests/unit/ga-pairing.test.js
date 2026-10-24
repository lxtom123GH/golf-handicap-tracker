import { describe, it, expect } from 'vitest';
import { gaScoreRecord, nineHoleStatus } from '../../src/ga-score-record.js';
const n=(id,d=5,extra={})=>({id,holesPlayed:9,rating:0,slope:113,adjustedGross:d,...extra});
const e=id=>n(id,20,{holesPlayed:18});
// Synthetic state-transition fixtures applying GA2026 §5F(vii–viii), not
// purported official numerical worked examples. Arrays are newest first.
describe('derived Australian pairing record',()=>{
 it('empty stays empty',()=>expect(gaScoreRecord([])).toEqual({completed:[],pending:[],expired:[]}));
 it('pairs oldest first and leaves the newest odd nine pending',()=>{
  const r=gaScoreRecord([n('e'),n('d'),n('c'),n('b'),n('a')]);
  expect(r.completed.map(p=>p.ids)).toEqual([['c','d'],['a','b']]);expect(r.pending).toEqual(['e']);
 });
 it('does not pair with an excluded or invalid nine',()=>{
  const r=gaScoreRecord([n('new'),n('bad',NaN),n('excluded',2,{notCounting:true}),n('old')]);
  expect(r.completed[0].ids).toEqual(['old','new']);
 });
 it('uses each component rating and slope independently',()=>{
  const r=gaScoreRecord([n('b',48,{rating:36,slope:113}),n('a',46,{rating:36,slope:113})]);
  expect(r.completed[0].diff).toBe(22);
 });
 it('rounds each component to a tenth before combining',()=>{
  expect(gaScoreRecord([n('b',5.35),n('a',5.35)]).completed[0].diff).toBe(10.8);
 });
 it('does not expire at nineteen later eighteens',()=>{
  const r=gaScoreRecord([n('new'),...Array.from({length:19},(_,i)=>e('e'+i)),n('old')]);
  expect(r.completed[0].ids).toEqual(['old','new']);expect(r.expired).toEqual([]);
 });
 it('expires before pairing after twenty later eighteens',()=>{
  const r=gaScoreRecord([n('new'),...Array.from({length:20},(_,i)=>e('e'+i)),n('old')]);
  expect(r.expired).toEqual(['old']);expect(r.pending).toEqual(['new']);expect(r.completed).toHaveLength(20);
 });
 it('places a pair at its completion, not its first component',()=>{
  const r=gaScoreRecord([n('b'),e('middle'),n('a')]);expect(r.completed.map(x=>x.id)).toEqual(['b','middle']);
 });
 it('a deleted component leaves its partner pending',()=>{
  const r=gaScoreRecord([n('a')]);expect(r.completed).toEqual([]);expect(r.pending).toEqual(['a']);
 });
 it('labels pending, combined and expired nines truthfully',()=>{
  expect(nineHoleStatus(n('a'),gaScoreRecord([n('a')]))).toBe('Pending another nine');
  expect(nineHoleStatus(n('a'),gaScoreRecord([n('b'),n('a')]))).toContain('combined differential 10.0');
  expect(nineHoleStatus(n('a'),gaScoreRecord([...Array.from({length:20},(_,i)=>e('e'+i)),n('a')]))).toContain('outside');
 });
 it('does not mutate frozen inputs',()=>{
  const a=Object.freeze(n('a')),b=Object.freeze(n('b'));
  expect(gaScoreRecord(Object.freeze([b,a])).completed[0].diff).toBe(10);
 });
 it('rejects non-finite slopes before they can become zero differentials',()=>{
  expect(gaScoreRecord([n('a',5,{slope:Infinity})]).pending).toEqual([]);
 });
});
