/**
 * Calculates a composite score (0-100) and yields a letter grade & badge combo based on Trench V2 Guidelines
 * @param {Object} metrics - Token activity and security variables
 * @returns {Object} { score: number, grade: string, badge: string }
 */
function calculateTokenScoreV2(metrics) {
    let score = 0;
    const badge = metrics.riskBadge || 'UNVERIFIED';

    // 1. Narrative / Hype Checklist Fit (Max 20 Points) [V2 Update]
    // Uses structural keyword evaluation if plain score isn't provided directly
    let patternScore = metrics.narrativePatternMatchScore || 0;
    if (!metrics.narrativePatternMatchScore && (metrics.tokenName || metrics.symbol)) {
        patternScore = calculateNarrativePatternScore(metrics.tokenName || '', metrics.description || '');
    }
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

    // Apply Wash Trading & Fake Holder Hard Penalties if flagged upstream
    if (metrics.washTradingPenalty) score -= metrics.washTradingPenalty;
    if (metrics.fakeHolderPenalty) score -= metrics.fakeHolderPenalty;

    // Cap structural score between 0 and 100
    const finalScore = Math.max(0, Math.min(Math.round(score), 100));

    // Calculate Dual-Axis Letter Grade Suffix Configuration
    let baseLetter = 'F';
    if (finalScore >= 90) baseLetter = 'S';
    else if (finalScore >= 75) baseLetter = 'A';
    else if (finalScore >= 60) baseLetter = 'B';
    else if (finalScore >= 40) baseLetter = 'C';
    else if (finalScore >= 20) baseLetter = 'D';

    // Enforcement Boundary: DANGER assets cannot rank above a "C"
    if (badge === 'DANGER' && ['S', 'A', 'B'].includes(baseLetter)) {
        baseLetter = 'C';
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

/**
 * Section 3 Checklist: Evaluates qualitative pattern metadata matching internet-native cultural standards
 */
function calculateNarrativePatternScore(name, description) {
    let narrativePts = 0;
    const cleanText = `${name} ${description}`.toLowerCase();

    // A & B: Culturally established equities / Zero Explanation concepts (PEPE, WIF, DOGE style)
    const tier1Anchors = ['doge', 'pepe', 'wif', 'bonk', 'hat', 'cat', 'frog', 'trump', 'biden'];
    if (tier1Anchors.some(anchor => cleanText.includes(anchor))) {
        narrativePts += 15;
    }

    // C: Remixability Indicator (Simple punchy assets outperform over-engineered lore)
    if (description.length > 0 && description.length < 120) {
        narrativePts += 5;
    }

    // G: "Next X" Pitch/Complex Roadmaps or Utility promises (Highly Predictive Scams)
    const marketingGimmicks = ['the next', 'utility', 'roadmap', 'presale', '1000x', 'gems', 'passive income'];
    if (marketingGimmicks.some(gimmick => cleanText.includes(gimmick))) {
        narrativePts -= 15;
    }

    return Math.max(0, narrativePts);
}

module.exports = { 
    calculateTokenScoreV2,
    calculateTokenScore: calculateTokenScoreV2 
};