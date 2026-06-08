// Simple testing framework since npm/jest is not available
export function describe(description, callback) {
    console.log(`\n=== \x1b[34m${description}\x1b[0m ===`);
    callback();
}

export function it(description, callback) {
    try {
        callback();
        console.log(`  \x1b[32m✔\x1b[0m ${description}`);
        if (typeof window !== 'undefined' && window.addTestResult) {
            window.addTestResult(true, description);
        }
    } catch (e) {
        console.error(`  \x1b[31m✖\x1b[0m ${description}`);
        console.error(`    ${e.message}`);
        if (typeof window !== 'undefined' && window.addTestResult) {
            window.addTestResult(false, description, e.message);
        }
    }
}

export function expect(actual) {
    return {
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, but got ${actual}`);
            }
        },
        toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
            }
        }
    };
}
