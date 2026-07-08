const axios = require('axios');
const { config } = require('./learningEngine'); 
const { analyzeHolders } = require('./holderAnalyzer');
const { calculateTokenScore } = require('./scoringEngine'); 
const { scanForSmartMoney } = require('./smartMoneyTracker'); 
const { analyzeSocialVelocity } = require('./socialVelocityEngine'); 

const watchlistMemory = new Map();

async function fetchTrendingTokens(chain = 'sol') {
    // 🌐 Omni-Chain Radar Mapping
    const dexChainMap = { 
        'sol': 'solana', 'eth': 'ethereum', 'bsc': 'bsc',
        'base': 'base', 'arb': 'arbitrum', 'poly': 'polygon',
        'avax': 'avalanche', 'opt': 'optimism', 'sui': 'sui'
    };
    const targetChain = dexChainMap[chain];

    try {
        const url = 'https://api.dexscreener.com/token-boosts/top/v1';
        const response = await axios.get(url);

        if (response.data && Array.isArray(response.data)) {
            const chainTokens = response.data
                .filter(t => t.chainId === targetChain)
                .slice(0, 30); 

            if (chainTokens.length === 0) {
                console.log(`ℹ️  [${chain.toUpperCase()}] No trending tokens found on DexScreener Boosts raw feed.`);
                return [];
            }

            const addresses = chainTokens.map(t => t.tokenAddress).join(',');
            const pairsUrl = `https://api.dexscreener.com/latest/dex/tokens/${addresses}`;
            const pairsResponse = await axios.get(pairsUrl);

            if (pairsResponse.data && pairsResponse.data.pairs) {
                const validTokens = [];
                const seenAddresses = new Set();
                const now = Date.now();

                console.log(`📊 [${chain.toUpperCase()}] Evaluating ${pairsResponse.data.pairs.length} active pairs through Trench Filters...`);

                for (const pair of pairsResponse.data.pairs) {
                    if (seenAddresses.has(pair.baseToken.address)) continue;

                    const tokenSymbol = pair.baseToken.symbol || 'UNKNOWN';
                    const contractAddress = pair.baseToken.address;

                    // 1. Filter: Age Check
                    const ageInMinutes = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : 0;
                    if (ageInMinutes < 2 || ageInMinutes > 360) {
                        console.log(`❌ [REJECTED] $${tokenSymbol}: Out of age sweet-spot (${Math.floor(ageInMinutes)}m old)`);
                        continue;
                    }

                    // 2. Filter: Market Cap Check
                    const mcap = pair.fdv || 0;
                    if (mcap < config.minMcap || mcap > config.maxMcap) {
                        console.log(`❌ [REJECTED] $${tokenSymbol}: Market Cap $${Math.floor(mcap).toLocaleString()} out of bounds ($${config.minMcap}-$${config.maxMcap})`);
                        continue;
                    }

                    // 3. Filter: Dynamic Liquidity Check per Chain Tier
                    const liq = pair.liquidity?.usd || 0;
                    let minLiq = 5000;
                    if (['eth', 'sol'].includes(chain)) minLiq = 10000;
                    else if (['base', 'arb', 'bsc'].includes(chain)) minLiq = 5000;
                    else if (['sui', 'avax', 'poly', 'opt'].includes(chain)) minLiq = 2000;

                    if (liq < minLiq) {
                        console.log(`❌ [REJECTED] $${tokenSymbol}: Low Liquidity ($${Math.floor(liq)} < $${minLiq})`);
                        continue;
                    }

                    // 4. Filter: Phase 7 Buy Pressure Check
                    const buys = pair.txns?.m5?.buys || 0;
                    const sells = pair.txns?.m5?.sells || 0;
                    const buySellRatio = sells > 0 ? (buys / sells) : buys;
                    if (buySellRatio <= 2.0) {
                        console.log(`❌ [REJECTED] $${tokenSymbol}: Low Buy/Sell Ratio (${buySellRatio.toFixed(2)}x)`);
                        continue;
                    }

                    // 5. Filter: Phase 8 Volume Acceleration Tracking Ticks
                    const currentVol5m = pair.volume?.m5 || 0;
                    
                    if (!watchlistMemory.has(contractAddress)) {
                        watchlistMemory.set(contractAddress, {
                            history: [currentVol5m],
                            lastSeen: now
                        });
                        console.log(`⏱️  [WATCHLIST] $${tokenSymbol} initialized into memory (Tick 1/3). Waiting for acceleration data...`);
                        continue;
                    }

                    let memory = watchlistMemory.get(contractAddress);
                    
                    if (now - memory.lastSeen < 60000) { 
                        continue; 
                    }

                    memory.history.push(currentVol5m);
                    memory.lastSeen = now;
                    if (memory.history.length > 3) memory.history.shift();
                    watchlistMemory.set(contractAddress, memory);

                    let volumeGrowthRate = 1.0;
                    if (memory.history.length >= 2) {
                        const prevVol = memory.history[memory.history.length - 2];
                        if (currentVol5m <= prevVol) {
                            console.log(`❌ [REJECTED] $${tokenSymbol}: Volume Momentum Dropped ($${currentVol5m} <= $${prevVol}). Purging from memory.`);
                            watchlistMemory.delete(contractAddress);
                            continue;
                        }
                        volumeGrowthRate = currentVol5m / (prevVol || 1);
                    }

                    if (memory.history.length < 3) {
                        console.log(`⏱️  [WATCHLIST] $${tokenSymbol}: Gathering momentum indices (Tick ${memory.history.length}/3)...`);
                        continue;
                    }

                    console.log(`🔥 [PASSED FILTERS] $${tokenSymbol} fully qualified! Initiating security audit...`);

                    const safeHolders = await analyzeHolders(chain, contractAddress);
                    if (!safeHolders) {
                        console.log(`🚨 [SECURITY FAIL] $${tokenSymbol}: Failed Holder Distribution Analysis.`);
                        watchlistMemory.delete(contractAddress);
                        continue;
                    }

                    const dummyHoldersPlaceholder = [{ address: contractAddress }]; 
                    const smartMoneyResults = await scanForSmartMoney(chain, dummyHoldersPlaceholder);
                    const socialResults = await analyzeSocialVelocity(chain, contractAddress, tokenSymbol);

                    const metricsPayload = {
                        buySellRatio,
                        volumeGrowthRate,
                        top10Percentage: 15, 
                        liquidity: liq,
                        mcap,
                        age: Math.floor(ageInMinutes),
                        smartMoneyBonus: smartMoneyResults.bonusPoints, 
                        socialScore: socialResults.socialScore
                    };

                    const compositeScore = calculateTokenScore(metricsPayload);
                    token.compositeScore = compositeScore;
                    
                    console.log(`🎯 [ANALYSIS COMPLETE] $${tokenSymbol} -> Composite Score: ${compositeScore}/100`);

                    seenAddresses.add(contractAddress);
                    validTokens.push({
                        address: contractAddress,
                        symbol: tokenSymbol,
                        liquidity: liq,
                        mcap: mcap, 
                        age: Math.floor(ageInMinutes),
                        vol5m: currentVol5m,
                        chartUrl: pair.url,
                        buySellRatio,
                        volumeGrowthRate,
                        compositeScore 
                    });

                    watchlistMemory.delete(contractAddress);
                }
                return validTokens; 
            }
        }
        return [];
    } catch (error) {
        console.error(`❌ Error fetching DexScreener data for ${chain.toUpperCase()}:`, error.message);
        return [];
    }
}

module.exports = { fetchTrendingTokens };