// Test-only catalog. Never imported by the normal production build.
import base from '../../vite.config.js';
import { E2E_PROJECT_ID, assertEmulatorEnvIsLoopback } from '../e2e/helpers/e2e-safety.js';
assertEmulatorEnvIsLoopback();
if (process.env.E2E_PROJECT_ID !== E2E_PROJECT_ID || !process.env.EMU_CONFIG)
    throw new Error('Golden fixture build requires the isolated demo emulator runner');
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
export default {
    ...base,
    plugins: [...base.plugins, {
        name: 'golden-synthetic-catalog', enforce: 'pre',
        transformIndexHtml(html) {
            if (!html.includes('<select id="oc-course-select">')) throw new Error('Golden fixture course selector anchor missing');
            return html.replace(/(<select id="oc-course-select">)[\s\S]*?(<\/select>)/,
                '$1<option value="">-- Select Course --</option><option>Synthetic Nine</option><option>Synthetic Eighteen</option><option value="Custom Course">Custom Course…</option>$2');
        },
        transform(code, id) {
            if (!id.replaceAll('\\', '/').endsWith('/src/course-data.js')) return null;
            return code + `\nfor (const name of Object.keys(COURSE_DATA)) delete COURSE_DATA[name];\nObject.assign(COURSE_DATA, ${JSON.stringify(catalog)});\n`;
        },
    }],
};
