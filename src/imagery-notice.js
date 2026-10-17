// imagery-notice.js — licence notices for the Queensland aerial imagery.
//
// The Queensland Imagery – Latest State Program Public Basemap Service
// (iteminfo, read 2026-10-17) requires (a) its Copyright Text on any copy of
// the imagery and (b) the acknowledgement below on any digital product that
// contains it. The Copyright Text lives in each course file's `attributions`;
// this module adds the licence link and the acknowledgement next to the map
// wherever a course's attributions name the State of Queensland.

export const QLD_IMAGERY_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const QLD_IMAGERY_SOURCE_URL =
    'https://www.data.qld.gov.au/dataset/queensland-imagery-latest-state-program-public-basemap-service';

export const QLD_IMAGERY_NOTICE =
    'In consideration of the State of Queensland permitting use of this data you acknowledge ' +
    'and agree that the State gives no warranty in relation to the data (including accuracy, ' +
    'reliability, completeness, currency or suitability) and accepts no liability (including ' +
    'without limitation, liability in negligence) for any loss, damage or costs (including ' +
    'consequential damage) relating to any use of the data.';

export function usesQldImagery(attributions) {
    return Array.isArray(attributions) && attributions.some(a => /State of Queensland/.test(String(a)));
}

function link(doc, href, text) {
    const a = doc.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
}

/**
 * Append the imagery licence link, source link and the required no-warranty
 * acknowledgement to an attribution element. No-op for courses without
 * Queensland imagery. Uses classes, not ids (contracts test).
 */
export function appendImageryNotice(el, attributions) {
    if (!el || !usesQldImagery(attributions)) return null;
    const doc = el.ownerDocument;
    el.appendChild(doc.createTextNode(' · Imagery '));
    el.appendChild(link(doc, QLD_IMAGERY_LICENCE_URL, 'CC BY-SA 4.0'));
    el.appendChild(doc.createTextNode(' · '));
    el.appendChild(link(doc, QLD_IMAGERY_SOURCE_URL, 'Source'));
    const details = doc.createElement('details');
    details.className = 'imagery-notice';
    const summary = doc.createElement('summary');
    summary.textContent = 'Imagery notice';
    const p = doc.createElement('span');
    p.className = 'imagery-notice-text';
    p.textContent = QLD_IMAGERY_NOTICE;
    details.append(summary, p);
    el.appendChild(details);
    return details;
}
