/**
 * Calculates a composite score from 0 to 100 for a token based on Trench Engine V1.0 metrics
 */
function calculateTokenScore(metrics) {
    let score = 0;

    // 1. Phase 7: Buy Pressure (Max 25 Points)
    const bsRatio = metrics.buySellRatio || 0;
    if (bsRatio >= 4.0) score += 25;
    else if (bsRatio >= 3.0) score += 20;
    else if (bsRatio >= 2.0) score += 12;

    // 2. Phase 8: Volume Growth Velocity (Max 25 Points)
    const growthRate = metrics.volumeGrowthRate || 1.0;
    if (growthRate >= 2.5) score += 25; // Massive volume explosion
    else if (growthRate >= 1.8) score += 20;
    else if (growthRate >= 1.2) score += 15;
    else if (growthRate > 1.0) score += 10;

    // 3. Phase 3: Holder Decentralization Safety (Max 20 Points)
    const top10 = metrics.top10Percentage || 25;
    if (top10 < 12) score += 20;      // Highly decentralized
    else if (top10 < 18) score += 15; // Extremely safe
    else if (top10 < 22) score += 10; // Moderate
    else if (top10 < 25) score += 5;  // Barely passing

    // 4. Liquidity-to-Market-Cap Health Ratio (Max 15 Points)
    const liqToMcap = metrics.liquidity / metrics.mcap;
    if (liqToMcap >= 0.25) score += 15; // Incredibly deep liquidity backing
    else if (liqToMcap >= 0.15) score += 10;
    else if (liqToMcap >= 0.08) score += 5;

    // 5. Token Age Sweet Spot (Max 15 Points)
    // Hyper-fresh stealth launches get premium score weight for maximum upside
    if (metrics.age >= 2 && metrics.age <= 20) score += 15;
    else if (metrics.age <= 60) score += 10;
    else if (metrics.age <= 180) score += 5;

    // ==========================================
    // 🛡️ PHASE 4: SMART MONEY MULTIPLIER 🛡️
    // Dynamically inject tracking weight bonuses
    // ==========================================
    const smartMoneyBonus = metrics.smartMoneyBonus || 0;
    score += smartMoneyBonus;

    // ==========================================
    // 🛡️ PHASE 5 & 6: NARRATIVE MULTIPLIER 🛡️
    // Allocates points based on LunarCrush social acceleration
    // ==========================================
    const targetSocialScore = metrics.socialScore || 50;
    if (targetSocialScore >= 85) score += 10;
    else if (targetSocialScore >= 70) score += 7;
    else if (targetSocialScore >= 50) score += 4;

    // Ensure strict ceiling boundary
    return Math.min(Math.round(score), 100);
}

module.exports = { calculateTokenScore };