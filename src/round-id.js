/** A round key must stay unique when rounds start in the same millisecond. */
export function createRoundId() {
    const unique = globalThis.crypto?.randomUUID?.()
        || `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    return `round_${Date.now()}_${unique}`;
}
