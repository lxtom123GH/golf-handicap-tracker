// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function fixture(env = {}) {
    vi.resetModules();
    vi.stubEnv('E2E_PROJECT_ID', env.project || 'demo-golf-tracker');
    vi.stubEnv('EMU_CONFIG', env.config ?? 'synthetic-emulator.json');
    return (await import('../golden/vite.config.js')).default;
}
describe('test-only synthetic catalog', () => {
    it('is absent from the ordinary build and application imports', () => {
        expect(readFileSync('vite.config.js','utf8')).not.toContain('golden');
        expect(readFileSync('package.json','utf8')).toContain('"build": "vite build"');
    });
    it('refuses a non-demo project and absent isolated config', async () => {
        await expect(fixture({project:'ordinary-project'})).rejects.toThrow('isolated demo');
        await expect(fixture({config:''})).rejects.toThrow('isolated demo');
    });
    it('only changes the catalog module, with wholly synthetic exact fixtures', async () => {
        const { E2E_PROJECT_ID }=await import('../e2e/helpers/e2e-safety.js');
        const config=await fixture({project:E2E_PROJECT_ID});
        const plugin=config.plugins.find(p=>p.name==='golden-synthetic-catalog');
        expect(plugin.transform('unchanged','/work/src/oncourse.js')).toBeNull();
        const context={};
        runInNewContext(plugin.transform('const COURSE_DATA={"Existing":{}};','/work/src/course-data.js')+';globalThis.catalog=COURSE_DATA;',context);
        expect(Object.keys(context.catalog)).toEqual(['Synthetic Nine','Synthetic Eighteen']);
        expect(context.catalog['Synthetic Nine']['Fixture Tee'].strokeIndex).toEqual([1,2,3,4,5,6,7,8,9]);
        expect(context.catalog['Synthetic Eighteen']['Fixture Tee'].pars).toHaveLength(18);
    });
    it('replaces only the on-course selector in the test HTML', async () => {
        const { E2E_PROJECT_ID }=await import('../e2e/helpers/e2e-safety.js');
        const config=await fixture({project:E2E_PROJECT_ID});
        const plugin=config.plugins.find(p=>p.name==='golden-synthetic-catalog');
        const html='<select id="other"><option>Keep</option></select><select id="oc-course-select"><option>Old</option></select>';
        expect(() => plugin.transformIndexHtml('<main>changed markup</main>')).toThrow('anchor missing');
        const result=plugin.transformIndexHtml(html);
        expect(result).toContain('<select id="other"><option>Keep</option></select>');
        expect(result).toContain('Synthetic Nine'); expect(result).not.toContain('>Old<');
    });
});
