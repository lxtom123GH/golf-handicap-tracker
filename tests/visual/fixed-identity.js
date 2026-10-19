// Visual fixtures only. Fixed emulator IDs make unsorted admin lists reproducible.
// This is not an Auth signup conformance test; real verification/admission UI
// still runs after the locally seeded account receives its synthetic token.
import { E2E_PROJECT_ID, assertLoopbackHost } from '../e2e/helpers/e2e-safety.js';
export async function fixedVisualIdentity(page, {uid, email}) {
    if (!E2E_PROJECT_ID.startsWith('demo-') || !email.endsWith('@example.invalid') || !uid.startsWith('style-'))
        throw new Error('Only synthetic demo identities may be seeded');
    const port = Number(process.env.EMU_AUTH_PORT || 9099);
    const host = assertLoopbackHost(`127.0.0.1:${port}`);
    const endpoint = `http://${host}/identitytoolkit.googleapis.com/v1`;
    async function request(action, body, admin = false) {
        const response = await fetch(`${endpoint}/accounts:${action}?key=synthetic-fixture`, {
            method: 'POST', signal: AbortSignal.timeout(5000),
            headers: {'Content-Type':'application/json', ...(admin ? {Authorization:'Bearer owner'} : {})},
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Synthetic Auth fixture ${action} failed: ${response.status}`);
        return response.json();
    }
    await page.route('**/identitytoolkit.googleapis.com/v1/accounts:signUp*', async route => {
        const url = new URL(route.request().url());
        if (!['localhost','127.0.0.1'].includes(url.hostname) || Number(url.port) !== port)
            throw new Error('Refusing a non-emulator signup route');
        const input = route.request().postDataJSON();
        if (input.email !== email) throw new Error('Unexpected identity in visual fixture');
        await request('signUp', {localId:uid, email, password:input.password, emailVerified:false}, true);
        const signedIn = await request('signInWithPassword', {email, password:input.password, returnSecureToken:true});
        await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({...signedIn, isNewUser:true})});
    });
}
