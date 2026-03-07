// Sydney Protocol: src/modules/ui-hazards.js
// Locale: en-AU (Australian Standard)
// Status: [ACTIVE] - Integrated with Keperra Course Data

import { calculate_hazard_rating } from './ui-scoring.js';
import { COURSE_DATA } from '../course-data.js';

/**
 * Evaluates the risk of a specific hazard based on the player's current position.
 * Uses the 5x5 Risk Matrix engine (Likelihood 1-5 x Consequence 1-5).
 */
export const evaluate_hazard_proximity = (player_location, course_key = "Keperra - Old (1-18)", tee_colour = "Yellow (Men)") => {
    
    // 1. Access the specific course and tee data
    const course = COURSE_DATA[course_key];
    if (!course) {
        console.error(`[SYDNEY ERROR] Course ${course_key} not found.`);
        return;
    }

    const tee_data = course[tee_colour];
    
    // 2. Iterate through holes to find hazards
    // Note: In a live round, you'd target a specific hole index
    Object.keys(tee_data).forEach(hole_number => {
        const hole = tee_data[hole_number];
        
        if (hole.hazards && Array.isArray(hole.hazards)) {
            hole.hazards.forEach(hazard => {
                const is_inside = player_location.x >= hazard.bounds.x_min && 
                                  player_location.x <= hazard.bounds.x_max &&
                                  player_location.y >= hazard.bounds.y_min && 
                                  player_location.y <= hazard.bounds.y_max;

                if (is_inside) {
                    // 3. Apply the 5x5 Risk Matrix logic from ui-scoring.js
                    let risk_assessment = calculate_hazard_rating(hazard.likelihood, hazard.consequence);

                    // PSPF Alignment: Water hazards are always treated as high severity,
                    // regardless of their likelihood score in the raw 5x5 inputs.
                    if (typeof hazard.type === 'string' && hazard.type.toLowerCase().includes('water')) {
                        risk_assessment = {
                            ...risk_assessment,
                            rating: "EXTREME",
                            // Preserve or elevate penalty; never below 1 for water.
                            penalty: Math.max(risk_assessment.penalty ?? 1, 1),
                            colour: "#d32f2f"
                        };
                    }

                    trigger_hazard_alert(hazard.type, risk_assessment);
                }
            });
        }
    });
};

/**
 * Updates the UI with a colour-coded warning based on the risk level.
 */
const trigger_hazard_alert = (type, risk) => {
    console.warn(`[RISK ALERT] Type: ${type} | Rating: ${risk.rating}`);
    
    // Select the appropriate Australian English spelling for the centre alert
    const alert_element = document.getElementById('hazard-centre-display');
    if (alert_element) {
        alert_element.style.borderColor = risk.colour; // e.g., #d32f2f for EXTREME
        alert_element.innerText = `CAUTION: ${type} Hazard - ${risk.rating} Risk`;
    }
};