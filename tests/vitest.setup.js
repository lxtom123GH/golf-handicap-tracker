// Node 26 exposes a global localStorage accessor that can be unavailable in a
// jsdom test. Keep the fallback local to the unavailable storage object:
// native jsdom Storage and Storage.prototype remain untouched.

const STORAGE_METHODS = new Set(['clear', 'getItem', 'key', 'removeItem', 'setItem', 'length']);

export function createStorage() {
    const data = new Map();
    const prototype = {};
    Object.defineProperties(prototype, {
        clear: { configurable: true, value() { data.clear(); } },
        getItem: { configurable: true, value(key) { return data.get(String(key)) ?? null; } },
        key: { configurable: true, value(index) { return [...data.keys()][index] ?? null; } },
        removeItem: { configurable: true, value(key) { data.delete(String(key)); } },
        setItem: { configurable: true, value(key, value) { data.set(String(key), String(value)); } },
        length: { configurable: true, get() { return data.size; } },
    });

    const target = Object.create(prototype);
    return new Proxy(target, {
        get(object, property, receiver) {
            if (typeof property === 'string' && !STORAGE_METHODS.has(property)
                && data.has(property)) return data.get(property);
            return Reflect.get(object, property, receiver);
        },
        set(object, property, value, receiver) {
            if (typeof property === 'string' && !STORAGE_METHODS.has(property)) {
                data.set(property, String(value));
                return true;
            }
            return Reflect.set(object, property, value, receiver);
        },
        deleteProperty(object, property) {
            if (typeof property === 'string' && !STORAGE_METHODS.has(property)) {
                data.delete(property);
                return true;
            }
            return Reflect.deleteProperty(object, property);
        },
        ownKeys() { return [...data.keys()]; },
        getOwnPropertyDescriptor(object, property) {
            if (typeof property === 'string' && data.has(property)) {
                return { configurable: true, enumerable: true, value: data.get(property), writable: true };
            }
            return Reflect.getOwnPropertyDescriptor(object, property);
        },
    });
}

function availableStorage(name) {
    try {
        return window[name];
    } catch {
        return null;
    }
}

if (typeof window !== 'undefined') {
    for (const name of ['localStorage', 'sessionStorage']) {
        if (!availableStorage(name)) {
            const storage = createStorage();
            Object.defineProperty(window, name, {
                configurable: true,
                writable: true,
                value: storage,
            });
        }
        // Vitest's jsdom global is normally window, but make bare
        // `localStorage` resolve to the same object when globals differ.
        if (globalThis !== window) {
            Object.defineProperty(globalThis, name, {
                configurable: true,
                get: () => window[name],
                set: value => Object.defineProperty(window, name, {
                    configurable: true, writable: true, value
                }),
            });
        }
    }
}
