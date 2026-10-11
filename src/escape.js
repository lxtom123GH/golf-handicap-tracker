/**
 * HTML-entity-encode an untrusted string for safe interpolation into innerHTML
 * text or quoted-attribute contexts. (BL-4.17)
 */
export function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
