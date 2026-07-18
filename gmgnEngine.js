const axios = require('axios');
const { config } = require('./learningEngine'); 
const { analyzeHolders } = require('./holderAnalyzer');
const { calculateTokenScore } = require('./scoringEngine'); 
const { scanForSmartMoney } = require('./smartMoneyTracker'); 
const { analyzeSocialVelocity } = require('./socialVelocityEngine'); 

async function fetchTrendingTokens(chain = 'sol') {
    // 🌐 Omni-Chain Radar Mapping
    const dexChainMap = { 
        'sol': 'solana', 'eth': 'ethereum', 'bsc': 'bsc',
        'base': 'base', 'arb': 'arbitrum', 'poly': 'polygon',
        'avax': 'avalanche', 'opt': 'optimism', 'sui': 'sui',
        'robinhood': 'robinhood' 
    };
    const targetChain = dexChainMap[chain];

    try {
        // 🚨 CHANGED: Now pulling the "New Launches" / Trenches feed instead of Paid Boosts
        const url = 'https://api.dexscreener.com/token-profiles/latest/v1';
        const response = await axios.get(url);

        if (response.data && Array.isArray(response.data)) {
            const chainTokens = response.data
                .filter(t => t.chainId === targetChain)
                .slice(0, 30); 

            if (chainTokens.length === 0) {
                console.log(`ℹ️  [${chain.toUpperCase()}] No new launches found in this cycle.`);
                return [];
            }

            const addresses = chainTokens.map(t => t.tokenAddress).join(',');
            const pairsUrl = `https://api.dexscreener.com/latest/dex/tokens/${addresses}`;
            const pairsResponse = await axios.get(pairsUrl);

            if (pairsResponse.data && pairsResponse.data.pairs) {
                const validTokens = [];
                const seenAddresses = new Set();
                const now = Date.now();

                console.log(`📊 [${chain.toUpperCase()}] Scanning ${pairsResponse.data.pairs.length} new pairs...`);

                for (const pair of pairsResponse.data.pairs) {
                    if (seenAddresses.has(pair.baseToken.address)) continue;

                    const tokenSymbol = pair.baseToken.symbol || 'UNKNOWN';
                    const contractAddress = pair.baseToken.address;

                    // 1. Filter: Age Check (Loosened to allow tokens up to 12 hours old)
                    const ageInMinutes = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : 0;
                    if (ageInMinutes > 720) {
                        continue;
                    }

                    const mcap = pair.fdv || 0;
                    const liq = pair.liquidity?.usd || 0;
                    
                    // 2. Buy Pressure Check (Basic fallback)
                    const buys = pair.txns?.m5?.buys || 0;
                    const sells = pair.txns?.m5?.sells || 0;
                    const buySellRatio = sells > 0 ? (buys / sells) : buys;

                    const currentVol5m = pair.volume?.m5 || 0;

                    console.log(`🔥 [NEW LAUNCH DETECTED] $${tokenSymbol} | Age: ${Math.floor(ageInMinutes)}m | Liq: $${Math.floor(liq)}`);

                    // 🚨 CHANGED: We removed the 3-minute memory block. 
                    // Tokens are now immediately scored and pushed to the UI while being scanned.
                    
                    const metricsPayload = {
                        buySellRatio,
                        volumeGrowthRate: 1.5, // Defaulted for immediate UI display
                        top10Percentage: 15, 
                        liquidity: liq,
                        mcap,
                        age: Math.floor(ageInMinutes),
                        smartMoneyBonus: 0, 
                        socialScore: 50
                    };

                    const compositeScore = calculateTokenScore(metricsPayload);
                    
                    seenAddresses.add(contractAddress);
                    
                    // Push everything to the index.js loop so it broadcasts to your dashboard instantly
                    validTokens.push({
                        address: contractAddress,
                        symbol: tokenSymbol,
                        liquidity: liq,
                        mcap: mcap, 
                        age: Math.floor(ageInMinutes),
                        vol5m: currentVol5m,
                        chartUrl: pair.url,
                        buySellRatio,
                        volumeGrowthRate: 1.5,
                        compositeScore 
                    });
                }
                return validTokens; 
            }
        }
        return [];
    } catch (error) {
        console.error(`❌ Error fetching New Launches for ${chain.toUpperCase()}:`, error.message);
        return [];
    }
}

module.exports = { fetchTrendingTokens };