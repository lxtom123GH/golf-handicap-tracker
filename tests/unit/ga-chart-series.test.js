import { it, expect, vi, beforeEach } from 'vitest';
const calls=vi.hoisted(()=>[]);
vi.mock('../../src/firebase-config.js',()=>({db:{},auth:{},functions:{}}));
vi.mock('chart.js/auto',()=>({default:vi.fn(function(_canvas,config){calls.push(config);this.destroy=vi.fn();})}));
import { renderTrendChart, renderRoundsHistory, UI } from '../../src/ui.js';
import { renderTrendChart as renderHandicapChart } from '../../src/whs.js';
const rounds=['p','a','b','c','d','e','f'].map(id=>({id,adjustedGross:id==='p'?0:5,rating:0,slope:113,holesPlayed:9,date:'2026-01-01'}));
beforeEach(()=>{calls.length=0;document.body.innerHTML='<canvas id="handicap-chart"></canvas><div id="chart-no-data"></div>';});
it('UI chart plots completed pairs once and omits the unpaired nine',()=>{
 renderTrendChart(rounds);expect(calls.at(-1).data.datasets[0].data).toEqual([10,10,10]);
});
it('WHS chart uses the same completed series',()=>{
 renderHandicapChart(rounds);expect(calls.at(-1).data.datasets[0].data).toEqual([10,10,10]);
});

it('history labels a pending component and marks both parts of a used pair',()=>{
 document.body.innerHTML='<table><tbody id="history-tbody"></tbody></table>';
 UI.historyTbody=document.getElementById('history-tbody');
 renderRoundsHistory(rounds,['a','b']);
 expect(document.querySelectorAll('.asterisk-highlight')).toHaveLength(2);
 expect(UI.historyTbody.textContent).toContain('Pending another nine');
 expect(UI.historyTbody.textContent).toContain('combined differential 10.0');
});
