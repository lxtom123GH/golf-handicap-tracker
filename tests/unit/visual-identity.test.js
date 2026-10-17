// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedVisualIdentity } from '../visual/fixed-identity.js';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
    vi.stubEnv('EMU_AUTH_PORT', '39099');
    const page={route:vi.fn()};
    await fixedVisualIdentity(page,{uid:'style-example',email:'test-style@example.invalid'});
    return page.route.mock.calls[0][1];
}
function request(url='http://127.0.0.1:39099/identitytoolkit.googleapis.com/v1/accounts:signUp', email='test-style@example.invalid') {
    return {request:()=>({url:()=>url,postDataJSON:()=>({email,password:'synthetic-fixture-only'})}),fulfill:vi.fn()};
}
describe('fixed visual identity guard',()=>{
    it('rejects non-synthetic email before registering a route',async()=>{
        const page={route:vi.fn()};
        await expect(fixedVisualIdentity(page,{uid:'style-example',email:'person@example.com'})).rejects.toThrow('synthetic demo');
        expect(page.route).not.toHaveBeenCalled();
    });
    it('rejects an identity outside the visual-fixture namespace',async()=>{
        await expect(fixedVisualIdentity({route:vi.fn()},{uid:'ordinary',email:'test@example.invalid'})).rejects.toThrow('synthetic demo');
    });
    it('refuses an off-box intercepted signup before sending anything',async()=>{
        const handler=await setup(), fetch=vi.fn();vi.stubGlobal('fetch',fetch);
        await expect(handler(request('https://example.com/identitytoolkit.googleapis.com/v1/accounts:signUp'))).rejects.toThrow('non-emulator');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('refuses an unexpected account in the local route',async()=>{
        const handler=await setup(), fetch=vi.fn();vi.stubGlobal('fetch',fetch);
        await expect(handler(request(undefined,'other@example.invalid'))).rejects.toThrow('Unexpected identity');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('uses only the guarded local emulator and preserves the fixed ID',async()=>{
        const handler=await setup();
        const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({localId:'style-example',idToken:'synthetic-token'})});vi.stubGlobal('fetch',fetch);
        const route=request();await handler(route);
        expect(fetch).toHaveBeenCalledTimes(2);
        for(const [url]of fetch.mock.calls)expect(new URL(url).origin).toBe('http://127.0.0.1:39099');
        expect(JSON.parse(fetch.mock.calls[0][1].body).localId).toBe('style-example');
        expect(JSON.parse(route.fulfill.mock.calls[0][0].body).isNewUser).toBe(true);
    });
});
