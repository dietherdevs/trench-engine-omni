const axios = require('axios');
const { analyzeHolders } = require('./holderAnalyzer');
const { calculateTokenScoreV2 } = require('./scoringEngine'); 

async function fetchTrendingTokens(chain = 'sol') {
    const dexChainMap = { 
        'sol': 'solana', 'eth': 'ethereum', 'bsc': 'bsc',
        'base': 'base', 'arb': 'arbitrum', 'poly': 'polygon',
        'avax': 'avalanche', 'opt': 'optimism', 'sui': 'sui'
    };
    const targetChain = dexChainMap[chain];

    try {
        const url = 'https://api.dexscreener.com/token-profiles/latest/v1';
        const response = await axios.get(url);

        if (response.data && Array.isArray(response.data)) {
            const chainTokens = response.data
                .filter(t => t.chainId === targetChain)
                .slice(0, 30); 

            if (chainTokens.length === 0) {
                return [];
            }

            const addresses = chainTokens.map(t => t.tokenAddress).join(',');
            const pairsUrl = `https://api.dexscreener.com/latest/dex/tokens/${addresses}`;
            const pairsResponse = await axios.get(pairsUrl);

            if (pairsResponse.data && pairsResponse.data.pairs) {
                const validTokens = [];
                const seenAddresses = new Set();
                const now = Date.now();

                for (const pair of pairsResponse.data.pairs) {
                    if (seenAddresses.has(pair.baseToken.address)) continue;

                    const tokenSymbol = pair.baseToken.symbol || 'UNKNOWN';
                    const tokenName = pair.baseToken.name || '';
                    const contractAddress = pair.baseToken.address;

                    const ageInMinutes = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : 0;
                    if (ageInMinutes > 720) continue; // Skip if older than 12 hours

                    const mcap = pair.fdv || 0;
                    const liq = pair.liquidity?.usd || 0;
                    
                    // Stage 1 Noise Floor check ($500 base parameter restriction)
                    if (liq < 500) continue; 

                    const buys = pair.txns?.m5?.buys || 0;
                    const sells = pair.txns?.m5?.sells || 0;
                    
                    // Section 2.1: Uniform Buy/Sell Verification checks
                    const uniqueBuyerRatio = sells > 0 ? (buys / sells) : buys;
                    const currentVol5m = pair.volume?.m5 || 0;

                    // Execute Asynchronous Forensics Framework Engine checks natively
                    const safetyReport = await analyzeHolders(chain, contractAddress);

                    const metricsPayload = {
                        tokenName,
                        symbol: tokenSymbol,
                        description: pair.description || '',
                        uniqueBuyerToSellerRatio: uniqueBuyerRatio,
                        volumeGrowthRate: pair.priceChange?.m5 ? Math.abs(pair.priceChange.m5) : 1.5,
                        isVolumePatternOrganic: true,
                        top10Percentage: safetyReport.top10Percentage, 
                        fakeHolderPenalty: safetyReport.fakeHolderPenalty,
                        riskBadge: safetyReport.riskBadge,
                        liquidity: liq,
                        mcap,
                        age: Math.floor(ageInMinutes),
                        smartMoneyClusters: 1, 
                        socialScore: 55
                    };

                    // Compute upgraded matrix score weights
                    const compositeScore = calculateTokenScoreV2(metricsPayload);
                    seenAddresses.add(contractAddress);
                    
                    validTokens.push({
                        address: contractAddress,
                        symbol: tokenSymbol,
                        liquidity: liq,
                        mcap: mcap, 
                        age: Math.floor(ageInMinutes),
                        vol5m: currentVol5m,
                        chartUrl: pair.url,
                        buySellRatio: uniqueBuyerRatio,
                        compositeScore: compositeScore 
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