import { describe, it, expect } from 'vitest';
import { roundDifferential } from '../../src/differential.js';
import { gaScoreRecord, nineHoleStatus } from '../../src/ga-score-record.js';
import { calculateIndex } from '../../src/whs.js';
const nine=id=>({id,slope:121,rating:34,adjustedGross:45,holesPlayed:9});
describe('Australian component and combined displays',()=>{
 it('leaves eighteen-hole values on their own scale',()=>expect(roundDifferential({slope:124,rating:70.5,adjustedGross:85,holesPlayed:18})).toBe(13.2));
 it.each([null,undefined,'',0,15,'15',40])('never invents an unplayed nine from %s',hi=>expect(roundDifferential(nine('a'),hi)).toBe(10.3));
 it.each([null,{slope:0,rating:34,adjustedGross:45},{slope:121,rating:34},{slope:121,adjustedGross:45}])('invalid input stays unknown',r=>expect(roundDifferential(r)).toBeNull());
 it('both asterisked components reproduce the combined score used by the index',()=>{
   const rounds=['a','b','c','d','e','f'].map(nine), record=gaScoreRecord(rounds), result=calculateIndex(rounds);
   expect(result.index).toBe('18.6');expect(result.usedIds).toHaveLength(2);
   const used=record.completed.find(p=>p.ids.every(id=>result.usedIds.includes(id)));
   expect(used.diff).toBe(20.6);
   for(const id of used.ids) expect(nineHoleStatus(rounds.find(r=>r.id===id),record)).toContain('combined differential 20.6');
 });
 it('unpaired nines have a pending label and no completed differential',()=>{
   const r=nine('a'), record=gaScoreRecord([r]);
   expect(record.completed).toEqual([]);expect(nineHoleStatus(r,record)).toBe('Pending another nine');
 });
});
