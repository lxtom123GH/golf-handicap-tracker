// BL-UX-20: inline jargon hints use the existing BL-NG-01 explainers as their
// single copy source. Native <details> keeps the disclosure keyboard-accessible.

const boundDocuments = new WeakSet();
const boundSources = new WeakSet();

export function initTermHints(root = document) {
    const documentRoot = typeof root.getElementById === 'function' ? root : root.ownerDocument;
    const view = documentRoot?.defaultView;

    const hints = () => [...documentRoot.querySelectorAll('[data-term-hint]')];
    const closeOpenHints = (except = null) => {
        hints().forEach(other => {
            if (other !== except && other.open) {
                other.open = false;
                other.removeAttribute('data-term-hint-positioned');
            }
        });
    };

    const positionHintBody = (hint) => {
        if (!view || !hint.open) return;
        const summary = hint.querySelector(':scope > summary');
        const body = hint.querySelector(':scope > .term-hint-body');
        if (!summary || !body) return;

        const summaryRect = summary.getBoundingClientRect();
        const viewportWidth = documentRoot.documentElement?.clientWidth || view.innerWidth;
        const viewportHeight = view.innerHeight || documentRoot.documentElement?.clientHeight || 0;
        const bodyWidth = Math.min(320, Math.max(0, viewportWidth - 32));
        const left = Math.max(16, Math.min(
            summaryRect.left + (summaryRect.width - bodyWidth) / 2,
            viewportWidth - bodyWidth - 16
        ));
        const bodyHeight = Math.min(body.scrollHeight || viewportHeight - 32, Math.max(0, viewportHeight - 32));
        const belowTop = summaryRect.bottom + 8;
        const belowSpace = viewportHeight - belowTop - 16;
        const aboveSpace = summaryRect.top - 16 - 8;
        const placeBelow = belowSpace >= aboveSpace;
        const availableHeight = Math.max(0, Math.min(bodyHeight, placeBelow ? belowSpace : aboveSpace));
        const top = placeBelow
            ? belowTop
            : Math.max(16, summaryRect.top - availableHeight - 8);
        hint.style.setProperty('--term-hint-left', `${Math.round(left)}px`);
        hint.style.setProperty('--term-hint-top', `${Math.round(top)}px`);
        hint.style.setProperty('--term-hint-max-height', `${Math.round(availableHeight)}px`);
        hint.setAttribute('data-term-hint-positioned', '1');
    };

    const positionOpenHints = () => hints().filter(hint => hint.open).forEach(positionHintBody);

    if (!boundDocuments.has(documentRoot)) {
        boundDocuments.add(documentRoot);
        const closeFromOutside = (event) => {
            const targetHint = event.target?.closest?.('[data-term-hint]');
            closeOpenHints(targetHint || null);
        };
        documentRoot.addEventListener('pointerdown', closeFromOutside, true);
        documentRoot.addEventListener('click', closeFromOutside, true);
        documentRoot.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeOpenHints();
        });
        documentRoot.addEventListener('scroll', positionOpenHints, { capture: true, passive: true });
        view?.addEventListener('resize', positionOpenHints);
        if (documentRoot.body && view?.MutationObserver) {
            new view.MutationObserver(mutations => {
                if (mutations.some(mutation => mutation.attributeName === 'data-active-tab')) closeOpenHints();
            }).observe(documentRoot.body, { attributes: true, attributeFilter: ['data-active-tab'] });
        }
    }

    root.querySelectorAll('[data-term-hint]').forEach(hint => {
        const source = documentRoot?.getElementById(hint.dataset.termExplainer);
        const body = hint.querySelector(':scope > .term-hint-body');
        if (!source || !body || (root !== documentRoot && !root.contains(source))) return;

        const explanation = [...source.children]
            .filter(child => child.tagName !== 'SUMMARY')
            .map(child => {
                const clone = child.cloneNode(true);
                clone.removeAttribute('id');
                clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
                return clone;
            });
        body.replaceChildren(...explanation);

        if (hint.dataset.termHintBound) return;
        hint.dataset.termHintBound = '1';
        if (!boundSources.has(source)) {
            boundSources.add(source);
            source.addEventListener('toggle', () => {
                if (source.open) closeOpenHints();
            });
        }
        hint.addEventListener('toggle', () => {
            if (!hint.open) {
                hint.removeAttribute('data-term-hint-positioned');
                return;
            }
            closeOpenHints(hint);
            source.open = false;
            positionHintBody(hint);
        });
    });
}
