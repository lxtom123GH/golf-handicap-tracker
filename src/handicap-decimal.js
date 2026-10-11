import Decimal from 'decimal.js';

// GA January 2026 guide §3B p9 and §3E p10: nearest tenth, ties toward
// positive infinity. A PLUS handicap is negative internally: -5.55 -> -5.5.
// Keep arithmetic decimal until the final rounding, not just the final display.
// Clone avoids changing the rounding policy of any other Decimal consumer.
export const HandicapDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_CEIL });

export function roundHandicap(value, places = 1) {
    const result = new HandicapDecimal(value).toDecimalPlaces(places).toNumber();
    return result === 0 ? 0 : result; // scratch, not negative zero
}

export function formatHandicap(value) {
    return roundHandicap(value).toFixed(1);
}

export function grossDifferentialDecimal(round) {
    return new HandicapDecimal(Number(round.adjustedGross)).minus(Number(round.rating))
        .times(113).div(Number(round.slope));
}

export function meanHandicap(values) {
    return values.reduce((sum, value) => sum.plus(value), new HandicapDecimal(0)).div(values.length);
}
