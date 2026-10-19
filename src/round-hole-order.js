/** Course-hole keys in the order this round is played. Scores and WHS arrays
 * stay keyed by these course holes; only navigation follows this sequence. */
export function holeOrder(totalHoles, startHole = 1) {
    const total = Number.isInteger(Number(totalHoles)) && Number(totalHoles) > 0 ? Number(totalHoles) : 9;
    const requested = Number(startHole);
    const start = Number.isInteger(requested) && requested >= 1 && requested <= total ? requested : 1;
    return Array.from({ length: total }, (_, i) => ((start - 1 + i) % total) + 1);
}

export function holePosition(currentHole, totalHoles, startHole = 1) {
    return holeOrder(totalHoles, startHole).indexOf(Number(currentHole));
}

export function nextHole(currentHole, totalHoles, startHole = 1) {
    const order = holeOrder(totalHoles, startHole);
    const position = order.indexOf(Number(currentHole));
    return position >= 0 && position < order.length - 1 ? order[position + 1] : null;
}

export function previousHole(currentHole, totalHoles, startHole = 1) {
    const order = holeOrder(totalHoles, startHole);
    const position = order.indexOf(Number(currentHole));
    return position > 0 ? order[position - 1] : null;
}
