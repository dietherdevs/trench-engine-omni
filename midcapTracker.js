const axios = require('axios');
const db = require('./db');
const { sendMidCapAlert } = require('./discord');

/**
 * 7-Point Checklist for Buy-The-Dip Setups
 * 1. Market Cap between $1M and $5M
 * 2. Token is 7-14 days old
 * 3. Price is retracing into a Fibonacci/Support zone
 * 4. Declining volume on the downward move
 * 5. Bullish reversal candle detected (e.g., hammer, engulfing)
 * 6. Risk Badge is not DANGER
 * 7. Clear invalidation level (stop loss) is identifiable
 */
async function runMidCapAnalysis() {
    console.log("⏳ Running V2 Mid-Cap Support & Resistance Check...");

    try {
        // Fetch tokens from our new PostgreSQL table that fit the baseline criteria
        const query = `
            SELECT * FROM midcap_watchlist 
            WHERE market_cap BETWEEN 1000000 AND 5000000 
            AND days_active BETWEEN 7 AND 14
            AND risk_badge != 'DANGER';
        `;
        const { rows: watchlist } = await db.query(query);

        if (watchlist.length === 0) {
            console.log("ℹ️ No mid-cap tokens currently fit the 7-14 day tracking window.");
            return;
        }

        for (const token of watchlist) {
            // NOTE: Using GeckoTerminal API as a reliable free source for OHLCV (historical candles)
            const ohlcvUrl = `https://api.geckoterminal.com/api/v2/networks/${token.chain}/pools/${token.contract_address}/ohlcv/hour?limit=24`;
            
            try {
                const candleRes = await axios.get(ohlcvUrl);
                const candles = candleRes.data?.data?.attributes?.ohlcv_list || [];

                if (candles.length < 12) continue; // Not enough history

                // Basic 7-Point Checklist Logic
                const recentCandles = candles.slice(0, 4); // Last 4 hours
                
                // Check 4: Declining Volume on the move down
                const isVolumeDeclining = recentCandles[0][5] < recentCandles[1][5] && recentCandles[1][5] < recentCandles[2][5];
                
                // Check 3 & 5: Support Zone & Reversal (Simplified: Current close > previous high, after a downtrend)
                const isReversing = recentCandles[0][4] > recentCandles[1][2]; 

                if (isVolumeDeclining && isReversing) {
                    console.log(`🎯 [SETUP DETECTED] $${token.symbol} is printing a reversal on declining volume!`);
                    
                    // Check 7: Invalidation level (Lowest point of the recent dip)
                    const invalidationLevel = Math.min(recentCandles[0][3], recentCandles[1][3]);

                    // Update database
                    await db.query(`
                        UPDATE midcap_watchlist 
                        SET in_support_zone = true, declining_volume = true, bullish_reversal = true, invalidation_level = $1, last_checked = CURRENT_TIMESTAMP
                        WHERE contract_address = $2
                    `, [invalidationLevel, token.contract_address]);

                    // Fire to Discord
                    await sendMidCapAlert(token, invalidationLevel);
                }

            } catch (apiError) {
                console.error(`⚠️ API Rate limit or fetch error for ${token.symbol}:`, apiError.message);
            }
        }
    } catch (error) {
        console.error("❌ Mid-Cap Tracker Database Error:", error.message);
    }
}

module.exports = { runMidCapAnalysis };