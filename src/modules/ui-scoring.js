// Sydney Protocol: src/modules/ui-scoring.js
// Locale: en-AU (Australian Standard)
// Status: [RESTORED]

/**
 * Calculates risk-weighted penalties based on a 5x5 matrix.
 * Uses ISO31000 principles: Likelihood (1-5) x Consequence (1-5).
 */
export const calculate_hazard_rating = (likelihood, consequence) => {
    const risk_score = likelihood * consequence;
    
    if (risk_score >= 15) {
        return { 
            rating: "EXTREME", 
            penalty: 2, 
            colour: "#d32f2f", // Australian Standard Warning Red
            description: "High-impact hazard. Avoid at all costs."
        };
    } else if (risk_score >= 8) {
        return { 
            rating: "MEDIUM", 
            penalty: 1, 
            colour: "#ffa000", // Caution Amber
            description: "Moderate hazard. Precision required."
        };
    } else {
        return { 
            rating: "LOW", 
            penalty: 0, 
            colour: "#388e3c", // Safety Green
            description: "Minimal risk. Play through."
        };
    }
};

/**
 * Initialises the scoring centre for the current round.
 */
export const initialise_scoring_centre = () => {
    console.log("Scoring Centre: Operational (en-AU).");
};