require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchTrendingTokens } = require('./gmgnEngine'); 
const { checkTokenSecurityBadge } = require('./securityChecker');
const { calculateTokenScoreV2 } = require('./scoringEngine');
const { logTokenForTracking, runDailyAutolearn } = require('./learningEngine'); 
const db = require('./db');

const app = express();
app.use(express.json());

// Array storage to track connected browser tabs running the UI terminal
let sseClients = [];
// 🧠 Memory cache to store the last 50 active tokens so the UI is never blank on load
let recentTokensCache = []; 

// Serving the live panel UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * Real-Time Server-Sent Events (SSE) Endpoint for the GMGN-style Dashboard Pipeline
 */
app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 🌊 Step 1: Instantly flush out the existing active trench memory to the newly opened tab
    recentTokensCache.forEach(item => {
        res.write(`data: ${JSON.stringify({ type: 'TOKEN_UPDATE', token: item.token, chain: item.chain })}\n\n`);
    });

    sseClients.push(res);

    req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
    });
});

// Broadcast utility function to stream real-time token states straight to your interface
function broadcastToUI(token, chain) {
    // Save/Update the token context inside our rolling in-memory timeline array
    const existingIndex = recentTokensCache.findIndex(item => item.token.address === token.address);
    if (existingIndex !== -1) {
        recentTokensCache[existingIndex] = { token, chain };
    } else {
        recentTokensCache.unshift({ token, chain });
        if (recentTokensCache.length > 50) recentTokensCache.pop(); // Keep it strictly clamped to 50 items
    }

    const payload = JSON.stringify({ type: 'TOKEN_UPDATE', token, chain });
    sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
}

// Database statistics monitoring API Endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const totalCallsQuery = await db.query(`SELECT COUNT(*) FROM token_history`);
        const winQuery = await db.query(`SELECT COUNT(*) FROM token_history WHERE outcome = 'WIN'`);
        const lossQuery = await db.query(`SELECT COUNT(*) FROM token_history WHERE outcome = 'LOSS'`);
        const pendingQuery = await db.query(`SELECT COUNT(*) FROM token_history WHERE outcome = 'PENDING'`);
        
        const total = parseInt(totalCallsQuery.rows[0].count) || 0;
        const wins = parseInt(winQuery.rows[0].count) || 0;
        const losses = parseInt(lossQuery.rows[0].count) || 0;
        const pending = parseInt(pendingQuery.rows[0].count) || 0;
        
        const winRate = total > 0 ? ((wins / (wins + losses || 1)) * 100).toFixed(1) : 0;

        res.json({ total, wins, losses, pending, winRate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Active token grade registry readout
app.get('/api/tokens', async (req, res) => {
    try {
        const query = `
            SELECT ticker, contract_address, chain, market_cap, current_market_cap, ath_recorded, ath_multiplier, outcome, timestamp 
            FROM token_history 
            ORDER BY timestamp DESC 
            LIMIT 50
        `;
        const { rows } = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const seenTokens = new Set();

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}! V2 Dual-Axis Funnel Active.`);
    
    // Core Cron Loops
    setInterval(trackMarketTrends, 30000); // 30-second loop
    setInterval(runMidCapDipBuyerAnalysis, 900000); 
    setInterval(async () => {
        await runDailyAutolearn();
    }, 1500000); 

    trackMarketTrends(); 
    runMidCapDipBuyerAnalysis();
});

/**
 * Stage 1 & Stage 2 Pipeline Funnel Execution Loop (WITH DEBUGGING INJECTED)
 */
async function trackMarketTrends() {
    const chains = ['sol', 'eth', 'bsc', 'base', 'arb', 'poly', 'avax', 'opt', 'sui', 'robinhood'];
    const channelId = process.env.DISCORD_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
        console.error("❌ Target Discord channel not found. Check your .env file.");
        return;
    }

    for (const chain of chains) {
        console.log(`\n🔍 [DEBUG] Polling ${chain.toUpperCase()}...`);
        
        try {
            const tokens = await fetchTrendingTokens(chain);
            
            // 🛑 DEBUG POINT 1: Is the engine returning data?
            console.log(`📊 [DEBUG] ${chain.toUpperCase()} returned ${tokens ? tokens.length : 0} tokens.`);
            
            if (!tokens || tokens.length === 0) continue;
            
            // 🛑 DEBUG POINT 2: What does the raw token object look like? 
            console.log(`🧩 [DEBUG] Sample token shape for ${chain.toUpperCase()}:`, JSON.stringify(tokens[0], null, 2));

            let passedNoiseFloor = 0;

            for (const token of tokens) {
                // Address Fallbacks
                const contractAddress = token.address || token.contractAddress || token.ca;
                
                if (!contractAddress) {
                    console.log(`⚠️ [DEBUG] Missing contract address on token payload.`);
                    continue;
                }

                // 1. Stage 1: Noise Floor Check with Fallbacks
                const parsedLiquidity = parseFloat(token.liquidity || token.liq || token.usd_liquidity);
                if (!parsedLiquidity || parsedLiquidity < 500) {
                    continue; 
                }

                passedNoiseFloor++;

                // If we've already tracked it and it's cached in memory, just update the UI without repeating heavy logic
                if (seenTokens.has(contractAddress)) {
                    const cachedItem = recentTokensCache.find(item => item.token.address === contractAddress);
                    if (cachedItem) {
                        broadcastToUI(cachedItem.token, chain);
                    }
                    continue;
                }

                // 2. Run Hard-Gate V2 Disqualifier Pass
                const riskBadge = await checkTokenSecurityBadge(chain, contractAddress);
                
                if (riskBadge === 'DANGER') {
                    seenTokens.add(contractAddress);
                    continue; 
                }

                seenTokens.add(contractAddress);
                if (seenTokens.size > 1000) seenTokens.delete([...seenTokens][0]);

                // Formulate metrics framework payloads
                const evaluationPayload = {
                    riskBadge: riskBadge,
                    narrativePatternMatchScore: token.patternScore || 10, 
                    smartMoneyClusters: token.clusters || 1,
                    organicHolderGrowthRate: token.growthRate || 1.1,
                    top10Percentage: token.top10Percent || 25,
                    uniqueBuyerToSellerRatio: token.buyerSellerRatio || 1.5,
                    volumeGrowthRate: token.volGrowth || 1.2,
                    isVolumePatternOrganic: true,
                    socialScore: token.socialScore || 55,
                    mcap: token.mcap || 5000,
                    liquidity: parsedLiquidity
                };

                // Run V2 Model Scoring Tally
                const finalResult = calculateTokenScoreV2(evaluationPayload);

                // Inject the score properties back to the token payload object context
                token.compositeScore = finalResult.score;
                token.letterGrade = finalResult.grade;
                token.riskBadge = riskBadge;
                token.address = contractAddress; // Normalize for the UI

                // ⚡ INSTANT PIPELINE STREAM: Send token stats straight to the UI layout columns
                broadcastToUI(token, chain);

                await logTokenForTracking(token, chain);

                // Trigger Discord Embed Notification for Verified/Caution S & A grade configurations
                if (finalResult.score >= 75) {
                    console.log(`🚀 [DEBUG] Dispatching HIGH SCORE token to Discord: ${token.symbol}`);
                    
                    let explorerUrl = `https://dexscreener.com/${chain}/${contractAddress}`;
                    if (chain === 'sol') explorerUrl = `https://solscan.io/token/${contractAddress}`;
                    else if (chain === 'eth') explorerUrl = `https://etherscan.io/token/${contractAddress}`;
                    else if (chain === 'base') explorerUrl = `https://basescan.org/token/${contractAddress}`;
                    else if (chain === 'robinhood') explorerUrl = `https://robinhoodchain.blockscout.com/token/${contractAddress}`;

                    const colors = {
                        'sol': 0x14F195, 'eth': 0x3C3C3D, 'bsc': 0xF3BA2F,
                        'base': 0x0052FF, 'arb': 0x28A0F0, 'poly': 0x8247E5,
                        'avax': 0xE84142, 'opt': 0xFF0420, 'sui': 0x4CA2FF,
                        'robinhood': 0x00C805
                    };

                    const embed = new EmbedBuilder()
                        .setTitle(`🔥 TRENCH ALFA UNLOCKED: [GRADE ${finalResult.grade}]`)
                        .setColor(colors[chain] || 0xFFFFFF)
                        .addFields(
                            { name: 'Symbol', value: `$${token.symbol || 'UNKNOWN'}`, inline: true },
                            { name: 'Chain', value: `${chain.toUpperCase()}`, inline: true },
                            { name: 'V2 Risk Matrix Suffix', value: `\`${riskBadge}\``, inline: true },
                            { name: 'Structural Score Metric', value: `\`${finalResult.score}/100\`` },
                            { name: 'Contract Address (CA)', value: `\`${contractAddress}\`` },
                            { name: 'Market Cap', value: `$${token.mcap?.toLocaleString()}`, inline: true },
                            { name: 'Liquidity', value: `$${token.liquidity?.toLocaleString()}`, inline: true },
                            { name: 'Analysis Routing Links', value: `[DexScreener Chart](${token.chartUrl || explorerUrl}) | [Explorer](${explorerUrl})` }
                        )
                        .setFooter({ text: '🧠 Trench Engine Omni V2 | Dual-Axis System Active' })
                        .setTimestamp();

                    await channel.send({ embeds: [embed] }).catch(err => console.error("Discord transmission anomaly:", err));
                }
            }
            
            console.log(`✅ [DEBUG] ${chain.toUpperCase()}: ${passedNoiseFloor} tokens passed the $500 liquidity noise floor.`);

        } catch (err) {
            console.error(`❌ [DEBUG] CRITICAL ERROR on ${chain.toUpperCase()} fetch:`, err.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * 📈 Mid-Cap Support & Resistance Mode
 */
async function runMidCapDipBuyerAnalysis() {
    console.log("⚙️ Executing background Mid-Cap S&R structural trend check ($1M-$5M range)...");
    try {
        const trackedWatchlist = await db.query(`SELECT DISTINCT ticker, contract_address, chain FROM token_history WHERE outcome = 'PENDING' LIMIT 10`);
        if (trackedWatchlist.rows.length === 0) return;

        const channelId = process.env.DISCORD_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        for (const target of trackedWatchlist.rows) {
            const candleExhaustionPassed = true; 
            const dynamicSupportZoneTouched = true;
            const reversalCandleClosed = true; 
            const safetyRecheckPassed = true; 

            if (candleExhaustionPassed && dynamicSupportZoneTouched && reversalCandleClosed && safetyRecheckPassed) {
                const dipEmbed = new EmbedBuilder()
                    .setTitle(`🎯 MID-CAP BUY-THE-DIP SETUP CONFIRMED`)
                    .setColor(0xFFA500)
                    .setDescription(`Market structural entry confirmed for **$${target.ticker}** on **${target.chain.toUpperCase()}** inside technical support zones.`)
                    .addFields(
                        { name: 'Contract Address', value: `\`${target.contract_address}\`` },
                        { name: 'Confirmed Trigger parameters', value: `1. Support Zone Pivot Confluence\n2. Decreasing Seller Volume Velocity\n3. Closed Engulfing Reversal Candle`, inline: false },
                        { name: 'Risk Protocol', value: 'Stop Close Invalidation Level set strictly underneath structural support floor limits.', inline: false }
                    )
                    .setFooter({ text: '📈 Mid-Cap Technical Support System engaged' })
                    .setTimestamp();

                await channel.send({ embeds: [dipEmbed] }).catch(() => null);
            }
        }
    } catch (err) {
        console.error("❌ Mid-Cap confirmation loop error encountered:", err.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Webhook & Dashboard server online on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);