export const UX_HARNESS_PROJECT_ID = 'demo-golf-tracker';

const PROJECT_ENV_KEYS = [
    'UX_HARNESS_PROJECT_ID',
    'VITE_FIREBASE_PROJECT_ID',
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT',
];

export function assertDemoHarnessProject(projectId) {
    if (projectId !== UX_HARNESS_PROJECT_ID) {
        throw new Error(
            `[UX harness] Refusing Firebase project "${projectId || '(unset)'}". ` +
            `Use the demo-only project "${UX_HARNESS_PROJECT_ID}".`,
        );
    }
    return projectId;
}

export function assertLocalEmulatorHost(host, service = 'Firebase emulator') {
    if (!host) return;
    let parsed;
    try {
        parsed = new URL(host.includes('://') ? host : `http://${host}`);
    } catch {
        throw new Error(`[UX harness] Invalid ${service} host "${host}"; expected a loopback address.`);
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        throw new Error(`[UX harness] Refusing non-local ${service} host "${host}".`);
    }
}

export function assertDemoHarnessTarget({ projectId, authHost, firestoreHost, appHost } = {}) {
    assertDemoHarnessProject(projectId);
    assertLocalEmulatorHost(authHost, 'Auth emulator');
    assertLocalEmulatorHost(firestoreHost, 'Firestore emulator');
    assertLocalEmulatorHost(appHost, 'UX harness app');
    return UX_HARNESS_PROJECT_ID;
}

export function assertDemoHarnessEnvironment(env = process.env) {
    for (const key of PROJECT_ENV_KEYS) {
        if (env[key]) assertDemoHarnessProject(env[key]);
    }
    for (const [key, service] of [
        ['FIREBASE_AUTH_EMULATOR_HOST', 'Auth emulator'],
        ['FIRESTORE_EMULATOR_HOST', 'Firestore emulator'],
        ['FIREBASE_FUNCTIONS_EMULATOR_HOST', 'Functions emulator'],
        ['FIREBASE_STORAGE_EMULATOR_HOST', 'Storage emulator'],
    ]) {
        if (env[key]) assertLocalEmulatorHost(env[key], service);
    }
    return UX_HARNESS_PROJECT_ID;
}
