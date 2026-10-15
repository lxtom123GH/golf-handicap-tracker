// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function fixture(env = {}) {
    vi.resetModules();
    vi.stubEnv('E2E_PROJECT_ID', env.project || 'demo-golf-tracker');
    vi.stubEnv('EMU_CONFIG', env.config ?? 'synthetic-emulator.json');
    return (await import('../visual/vite.config.js')).default;
}
describe('test-only synthetic catalog', () => {
    it('is absent from the ordinary build and application imports', () => {
        expect(readFileSync('vite.config.js','utf8')).not.toContain('visual');
        expect(readFileSync('package.json','utf8')).toContain('"build": "vite build"');
    });
    it('refuses a non-demo project and absent isolated config', async () => {
        await expect(fixture({project:'ordinary-project'})).rejects.toThrow('isolated demo');
        await expect(fixture({config:''})).rejects.toThrow('isolated demo');
    });
    it('only changes the catalog module, with wholly synthetic exact fixtures', async () => {
        const { E2E_PROJECT_ID }=await import('../e2e/helpers/e2e-safety.js');
        const config=await fixture({project:E2E_PROJECT_ID});
        const plugin=config.plugins.find(p=>p.name==='style-synthetic-catalog');
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
        const plugin=config.plugins.find(p=>p.name==='style-synthetic-catalog');
        const html='<select id="other"><option>Keep</option></select><select id="oc-course-select"><option>Old</option></select>';
        expect(() => plugin.transformIndexHtml('<main>changed markup</main>')).toThrow('anchor missing');
        const result=plugin.transformIndexHtml(html);
        expect(result).toContain('<select id="other"><option>Keep</option></select>');
        expect(result).toContain('Synthetic Nine'); expect(result).not.toContain('>Old<');
    });
    it('replaces mapped-course labels without rewriting unrelated modules', async () => {
        const { E2E_PROJECT_ID }=await import('../e2e/helpers/e2e-safety.js');
        const config=await fixture({project:E2E_PROJECT_ID});
        const plugin=config.plugins.find(p=>p.name==='style-synthetic-catalog');
        const code="const courses = [{name: 'Keperra Country Golf Club', slug: 'keperra'}];";
        expect(plugin.transform(code, '/work/src/modules/hole-plan-card.js')).toContain("name: 'Synthetic Mapped Course A'");
        expect(plugin.transform(code, '/work/src/modules/event-binders.js')).toContain("name: 'Synthetic Mapped Course A'");
        expect(plugin.transform(code, '/work/src/ui.js')).toBeNull();
    });
    it('emits invented geometry for all four mapped-course fixture files', async () => {
        const { E2E_PROJECT_ID }=await import('../e2e/helpers/e2e-safety.js');
        const config=await fixture({project:E2E_PROJECT_ID});
        const plugin=config.plugins.find(p=>p.name==='style-synthetic-catalog');
        const emitted=[];
        plugin.generateBundle.call({emitFile: asset => emitted.push(asset)});
        expect(emitted).toHaveLength(4);
        for (const asset of emitted) {
            const data=JSON.parse(asset.source);
            expect(data.name).toBe('Synthetic Mapped Course');
            expect(Object.keys(data.holes)).toHaveLength(18);
            expect(data.holes['1'].tee).toEqual({lat:0,lon:0});
            expect(data.holes['1'].green.centre).toEqual({lat:0.003,lon:0});
            expect(data.contextImagery).toBeUndefined();
        }
    });

});
