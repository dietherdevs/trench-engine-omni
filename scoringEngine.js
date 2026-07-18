/**
 * Calculates a composite score (0-100) and yields a letter grade & badge combo based on Trench V2 Guidelines
 * @param {Object} metrics - Token activity and security variables
 * @returns {Object} { score: number, grade: string, badge: string }
 */
function calculateTokenScoreV2(metrics) {
    let score = 0;
    const badge = metrics.riskBadge || 'UNVERIFIED';

    // 1. Narrative / Hype Checklist Fit (Max 20 Points) [V2 Update]
    const patternScore = metrics.narrativePatternMatchScore || 0; 
    score += Math.min(patternScore, 20);

    // 2. Wallet Quality / Smart Money Clustering (Max 20 Points) [V2 Update]
    const activeClusters = metrics.smartMoneyClusters || 0;
    if (activeClusters >= 4) score += 20;
    else if (activeClusters >= 2) score += 12;
    else if (activeClusters > 0) score += 5;

    // 3. Holder Growth Authenticity Sub-Check (Max 15 Points) [V2 Update]
    const organicGrowthRate = metrics.organicHolderGrowthRate || 0;
    if (organicGrowthRate >= 1.5) score += 15;
    else if (organicGrowthRate >= 1.0) score += 10;
    else if (organicGrowthRate >= 0.5) score += 5;

    // 4. Distribution Matrix (Max 15 Points) [V2 Update]
    const top10Concentration = metrics.top10Percentage || 35;
    if (top10Concentration < 12) score += 15;
    else if (top10Concentration < 20) score += 10;
    else if (top10Concentration < 30) score += 5;

    // 5. Buy Pressure Metrics (Max 10 Points) [V2 Update]
    const uniqueBuyerRatio = metrics.uniqueBuyerToSellerRatio || 1.0;
    if (uniqueBuyerRatio >= 3.0) score += 10;
    else if (uniqueBuyerRatio >= 1.5) score += 6;

    // 6. Volume Growth Quality Pattern (Max 10 Points) [V2 Update]
    const volVelocity = metrics.volumeGrowthRate || 1.0;
    const pathIsOrganic = metrics.isVolumePatternOrganic !== false;
    if (pathIsOrganic) {
        if (volVelocity >= 2.5) score += 10;
        else if (volVelocity >= 1.5) score += 6;
    }

    // 7. Social Growth Tracking (Max 5 Points) [V2 Update]
    const structuralSocialScore = metrics.socialScore || 50;
    if (structuralSocialScore >= 75) score += 5;
    else if (structuralSocialScore >= 50) score += 2;

    // 8. Liquidity Health Scale (Max 5 Points) [V2 Update]
    const liqToMcap = metrics.mcap > 0 ? (metrics.liquidity / metrics.mcap) : 0;
    if (liqToMcap >= 0.20) score += 5;
    else if (liqToMcap >= 0.10) score += 3;

    // Cap structural score at 100 Max
    const finalScore = Math.min(Math.round(score), 100);

    // Calculate Dual-Axis Letter Grade Suffix Configuration
    let baseLetter = 'F';
    if (finalScore >= 90) baseLetter = 'S';
    else if (finalScore >= 75) baseLetter = 'A';
    else if (finalScore >= 60) baseLetter = 'B';
    else if (finalScore >= 40) baseLetter = 'C';
    else if (finalScore >= 20) baseLetter = 'D';

    // Enforcement Boundary: DANGER assets cannot rank above a "C"
    if (badge === 'DANGER') {
        if (baseLetter === 'S' || baseLetter === 'A' || baseLetter === 'B') {
            baseLetter = 'C';
        }
    }

    // Formulate final visible grade string format
    let finalGrade = baseLetter;
    if (badge === 'CAUTION') finalGrade += ' - CAUTION';
    else if (badge === 'DANGER') finalGrade += ' - DANGER';
    else if (badge === 'UNVERIFIED') finalGrade += ' - UNVERIFIED';

    return {
        score: finalScore,
        grade: finalGrade,
        badge: badge
    };
}

// Exported with backward compatibility alias to prevent downstream system crashes
module.exports = { 
    calculateTokenScoreV2,
    calculateTokenScore: calculateTokenScoreV2 
};