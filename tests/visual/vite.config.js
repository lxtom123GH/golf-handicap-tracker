// Test-only catalog. Never imported by the normal production build.
import base from '../../vite.config.js';
import { E2E_PROJECT_ID, assertEmulatorEnvIsLoopback } from '../e2e/helpers/e2e-safety.js';
assertEmulatorEnvIsLoopback();
if (process.env.E2E_PROJECT_ID !== E2E_PROJECT_ID || !process.env.EMU_CONFIG)
    throw new Error('Style fixture build requires the isolated demo emulator runner');
const catalog = {
    'Synthetic Nine': { 'Fixture Tee': {
        rating: 36, slope: 113, par: 36,
        pars: [4,4,4,4,4,4,4,4,4], strokeIndex: [1,2,3,4,5,6,7,8,9],
    } },
    'Synthetic Eighteen': { 'Fixture Tee': {
        rating: 72, slope: 113, par: 72,
        pars: Array(18).fill(4), strokeIndex: Array.from({ length: 18 }, (_, i) => i+1),
    } },
};
const labels = {
    'Keperra Country Golf Club': 'Synthetic Mapped Course A',
    'Ashgrove Golf Club': 'Synthetic Mapped Course B',
    'Redcliffe Golf Club': 'Synthetic Mapped Course C',
    'Virginia Golf Club': 'Synthetic Mapped Course D',
};
const hole = { number: 1, par: 4, handicap: 1,
    tee: {lat: 0, lon: 0},
    green: {centre: {lat: 0.003, lon: 0}, front: {lat: 0.0029, lon: 0}, back: {lat: 0.0031, lon: 0}},
    line: [{lat: 0, lon: 0}, {lat: 0.003, lon: 0}],
    features: {}, fairwayLine: [{lat: 0, lon: 0, widthM: 30}, {lat: 0.003, lon: 0, widthM: 30}],
};
export const syntheticOverlay = {name: 'Synthetic Mapped Course', source: 'invented test geometry',
    holes: Object.fromEntries(Array.from({length: 18}, (_, i) => [String(i+1), {...hole, number: i+1}]))};
export default {
    ...base,
    define: {...base.define, __BUILD_STAMP__: JSON.stringify("Synthetic style fixture"), __BUILD_COMMIT__: JSON.stringify("synthetic")},
    plugins: [...base.plugins, {
        name: 'style-synthetic-catalog', enforce: 'pre',
        transformIndexHtml(html) {
            if (!html.includes('<select id="oc-course-select">')) throw new Error('Style fixture course selector anchor missing');
            for (const [name, label] of Object.entries(labels)) html = html.replaceAll(name, label);
            for (const name of ['Keperra', 'Ashgrove', 'Redcliffe', 'Virginia']) html = html.replaceAll(name, 'Synthetic Course');
            return html.replace(/(<select id="oc-course-select">)[\s\S]*?(<\/select>)/,
                '$1<option value="">-- Select Course --</option><option>Synthetic Nine</option><option>Synthetic Eighteen</option><option value="Custom Course">Custom Course…</option>$2');
        },
        generateBundle() {
            for (const slug of ['keperra', 'ashgrove', 'redcliffe', 'virginia'])
                this.emitFile({type: 'asset', fileName: `courses/${slug}.json`, source: JSON.stringify(syntheticOverlay)});
        },
        transform(code, id) {
            if (['/src/modules/hole-plan-card.js', '/src/modules/event-binders.js'].some(path => id.replaceAll('\\', '/').endsWith(path))) {
                for (const [name, label] of Object.entries(labels)) code = code.replaceAll(`name: '${name}'`, `name: '${label}'`);
                return code;
            }
            if (!id.replaceAll('\\', '/').endsWith('/src/course-data.js')) return null;
            return code + `\nfor (const name of Object.keys(COURSE_DATA)) delete COURSE_DATA[name];\nObject.assign(COURSE_DATA, ${JSON.stringify(catalog)});\n`;
        },
    }],
};
