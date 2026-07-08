const axios = require('axios');
const db = require('./db'); 

let config = {
    minVol5m: 5000,
    minMcap: 5000,
    maxMcap: 100000,
    learningRate: 0.05 
};

// Insert newly approved tokens into PostgreSQL
async function logTokenForTracking(token, chain) {
    try {
        const query = `
            INSERT INTO token_history (ticker, contract_address, chain, market_cap, current_market_cap, ath_recorded, ath_multiplier, composite_score, outcome)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
        `;
        const values = [
            token.symbol, 
            token.address, 
            chain, 
            token.mcap, 
            token.mcap, // Initial current market cap
            token.mcap, // Initial ATH is the entry point
            1.0,        // Initial ATH multiplier
            token.compositeScore || 0
        ];
        await db.query(query, values);
        console.log(`💾 Saved $${token.symbol} to PostgreSQL.`);
    } catch (error) {
        console.error(`❌ DB Insert Error for ${token.symbol}:`, error.message);
    }
}

// Automated execution worker loop running at a fast interval
async function runHighFrequencyAutolearn() {
    try {
        // Track both pending tokens and previous losses in case they pull a delayed pump to 2x
        const query = `
            SELECT id, ticker, contract_address, market_cap, ath_recorded, outcome 
            FROM token_history 
            WHERE outcome = 'PENDING' OR outcome = 'LOSS'
            ORDER BY timestamp DESC LIMIT 30
        `;
        const { rows: trackedTokens } = await db.query(query);

        if (trackedTokens.length === 0) return config;

        for (let token of trackedTokens) {
            try {
                const url = `https://api.dexscreener.com/latest/dex/tokens/${token.contract_address}`;
                const response = await axios.get(url);

                let currentOutcome = token.outcome;
                let currentMcap = 0;
                let athRecorded = parseFloat(token.ath_recorded) || parseFloat(token.market_cap);

                if (response.data && response.data.pairs && response.data.pairs[0]) {
                    const currentPair = response.data.pairs[0];
                    currentMcap = currentPair.fdv || 0;
                    
                    // 1. Update the Absolute Peak All-Time High Recorded
                    if (currentMcap > athRecorded) {
                        athRecorded = currentMcap;
                        console.log(`📈 NEW ATH PEAK: $${token.ticker} broke out to $${Math.floor(athRecorded).toLocaleString()}!`);
                    }

                    const currentMultiplier = currentMcap / token.market_cap;
                    const athMultiplier = athRecorded / token.market_cap;

                    // 2. Exact Metrics Evaluation Mapping
                    if (athMultiplier >= 2.0) {
                        // If the historical maximum multiplier reached 2x or higher, it is locked as a WIN
                        if (currentOutcome !== 'WIN') {
                            console.log(`🏆 [WIN DECLARED] $${token.ticker} secured 2x target validation via historical ATH (${athMultiplier.toFixed(2)}x)!`);
                            config.minVol5m -= config.minVol5m * config.learningRate;
                        }
                        currentOutcome = 'WIN';
                    } else if (currentMultiplier <= 0.5 && currentOutcome === 'PENDING') {
                        // If it drops 50% below entry and never hit 2x, mark as LOSS
                        console.log(`📉 [STOP LOSS HIT] $${token.ticker} plummeted below 50% entry margin.`);
                        config.minVol5m += config.minVol5m * config.learningRate;
                        currentOutcome = 'LOSS';
                    }

                    // Update the database record with the highly accurate ATH and corresponding outcome state
                    await db.query(
                        `UPDATE token_history 
                         SET outcome = $1, current_market_cap = $2, ath_recorded = $3, ath_multiplier = $4 
                         WHERE id = $5`, 
                        [currentOutcome, currentMcap, athRecorded, athMultiplier, token.id]
                    );
                }
            } catch (apiError) {
                console.error(`Error auditing $${token.ticker}:`, apiError.message);
            }
        }
        return config;
    } catch (dbError) {
        console.error("❌ DB Query Error during Autolearn:", dbError.message);
        return config;
    }
}

module.exports = { logTokenForTracking, runDailyAutolearn: runHighFrequencyAutolearn, config };