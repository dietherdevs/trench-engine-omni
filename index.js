require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchTrendingTokens } = require('./gmgnEngine'); 
const { isTokenSafe } = require('./securityChecker');
const { logTokenForTracking, runDailyAutolearn } = require('./learningEngine'); 
const db = require('./db');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

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

client.once('clientReady', () => {
    console.log(`🤖 Logged in as ${client.user.tag}! Machine Learning Feedback Loop Active.`);
    setInterval(trackMarketTrends, 60000);
    setInterval(async () => {
        await runDailyAutolearn();
    }, 15000); 
    trackMarketTrends(); 
});

async function trackMarketTrends() {
    // 🌐 Omni-Chain Execution Array
    const chains = ['sol', 'eth', 'bsc', 'base', 'arb', 'poly', 'avax', 'opt', 'sui'];
    const channelId = process.env.DISCORD_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
        console.error("❌ Target Discord channel not found. Check your .env file.");
        return;
    }

    for (const chain of chains) {
        console.log(`🔍 Scanning Trench Engine metrics for ${chain.toUpperCase()}...`);
        const tokens = await fetchTrendingTokens(chain);

        for (const token of tokens) {
            const contractAddress = token.address;

            if (seenTokens.has(contractAddress)) continue;

            const safe = await isTokenSafe(chain, contractAddress);
            if (!safe) {
                seenTokens.add(contractAddress);
                continue; 
            }

            seenTokens.add(contractAddress);
            if (seenTokens.size > 500) seenTokens.delete([...seenTokens][0]);

            await logTokenForTracking(token, chain);

            const ALERT_THRESHOLD = 85; 
            if (token.compositeScore < ALERT_THRESHOLD) continue; 

            let explorerUrl = `https://dexscreener.com/${chain}/${contractAddress}`;
            if (chain === 'sol') explorerUrl = `https://solscan.io/token/${contractAddress}`;
            else if (chain === 'eth') explorerUrl = `https://etherscan.io/token/${contractAddress}`;
            else if (chain === 'bsc') explorerUrl = `https://bscscan.com/token/${contractAddress}`;
            else if (chain === 'base') explorerUrl = `https://basescan.org/token/${contractAddress}`;

            // Dynamic Discord Embed Colors mapped to the chain
            const colors = {
                'sol': 0x14F195, 'eth': 0x3C3C3D, 'bsc': 0xF3BA2F,
                'base': 0x0052FF, 'arb': 0x28A0F0, 'poly': 0x8247E5,
                'avax': 0xE84142, 'opt': 0xFF0420, 'sui': 0x4CA2FF
            };

            const embed = new EmbedBuilder()
                .setTitle(`🔥 TRENCH ALFA UNLOCKED: [SCORE ${token.compositeScore}/100]`)
                .setColor(colors[chain] || 0xFFFFFF)
                .addFields(
                    { name: 'Symbol', value: `$${token.symbol || 'UNKNOWN'}`, inline: true },
                    { name: 'Chain', value: `${chain.toUpperCase()}`, inline: true },
                    { name: 'Contract Address (CA)', value: `\`${contractAddress}\`` },
                    { name: 'Market Cap', value: `$${token.mcap?.toLocaleString()}`, inline: true },
                    { name: 'Liquidity', value: `$${token.liquidity?.toLocaleString()}`, inline: true },
                    { name: 'Analysis Links', value: `[DexScreener Chart](${token.chartUrl}) | [Explorer](${explorerUrl})` }
                )
                .setFooter({ text: '✅ Audited | 🧠 Omni-Chain Engine Engaged' })
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(err => console.error("Discord message failed to send:", err));
        }

        // ⏱️ Anti-Rate Limit Stagger (Wait 3 seconds before hitting the API for the next chain)
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Webhook & Dashboard server online on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);