import { calculateHoleStableford } from './whs.js';
// Test Scenario: Hole 4 at Keperra (Old Course)
// Par 4, Stroke Index 8. You have a 12 Handicap.
// If you have a 5 (Gross Bogey), you should get 1 Stableford point.

const par = 4;
const si = 8;
const handicap = 12;
const score = 5;

const points = calculateHoleStableford(score, par, si, handicap);

console.log("--- KEPERRA MATH VALIDATION ---");
console.log(`Hole: Par ${par}, SI ${si}`);
console.log(`Player: ${handicap} Handicap, shot a ${score}`);
console.log(`RESULT: ${points} Stableford Points`);
console.log("-------------------------------");