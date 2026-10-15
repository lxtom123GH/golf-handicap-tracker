import { it, expect } from 'vitest';
import { playerHandicapCategory, setPlayerHandicapCategory, categoryForRating } from '../../src/handicap-category.js';
it('stores only explicit choices outside serializable player data',()=>{
 const player=Object.freeze({uid:'synthetic'}), before=JSON.stringify(player);
 expect(playerHandicapCategory(player)).toBeNull();setPlayerHandicapCategory(player,'women');
 expect(playerHandicapCategory(player)).toBe('women');expect(JSON.stringify(player)).toBe(before);
 expect(playerHandicapCategory({uid:'synthetic'})).toBeNull();
 setPlayerHandicapCategory(player,'unknown');expect(playerHandicapCategory(player)).toBeNull();
});

it('refuses a category that contradicts the selected rated tee',()=>{
 expect(categoryForRating('women','Blue (Men)')).toBeNull();
 expect(categoryForRating('men','Red (Women)')).toBeNull();
 expect(categoryForRating('men','Blue (Men)')).toBe('men');
 expect(categoryForRating('women','Red (Women)')).toBe('women');
 expect(categoryForRating(null,'Blue (Men)')).toBeNull();
 expect(categoryForRating('women','Custom')).toBe('women');
});
