require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./db'); 

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', async () => {
    console.log(`🛠️ Connected as ${client.user.tag} for Database Recovery...`);
    
    const channelId = process.env.DISCORD_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
        console.error("❌ Could not find the Discord channel. Check DISCORD_CHANNEL_ID in .env");
        process.exit(1);
    }

    console.log(`📥 Fetching recent signals from #${channel.name}...`);
    const messages = await channel.messages.fetch({ limit: 20 });

    let recoveredCount = 0;

    for (const [id, msg] of messages) {
        // Only look at messages sent by the bot that contain an embed
        if (msg.author.id === client.user.id && msg.embeds.length > 0) {
            const embed = msg.embeds[0];
            
            // Check if it's an official Trench Engine signal
            if (embed.title && embed.title.includes("TRENCH ENGINE APPROVED")) {
                try {
                    const symbolField = embed.fields.find(f => f.name === 'Symbol');
                    const caField = embed.fields.find(f => f.name.includes('Contract Address'));
                    const mcapField = embed.fields.find(f => f.name === 'Market Cap');

                    if (!symbolField || !caField) continue;

                    // Clean the scraped data
                    const ticker = symbolField.value.replace('$', '').trim();
                    const contractAddress = caField.value.replace(/`/g, '').trim();
                    
                    let mcap = 0;
                    if (mcapField) {
                        // Remove $ and commas to convert "$49,318" into 49318
                        mcap = parseInt(mcapField.value.replace(/[^0-9.-]+/g, ""));
                    }

                    // Check if this token is already in the database
                    const check = await db.query('SELECT contract_address FROM token_history WHERE contract_address = $1', [contractAddress]);
                    
                    if (check.rows.length === 0) {
                        // Insert the old token with default values for the new metrics we added today
                        await db.query(`
                            INSERT INTO token_history (ticker, contract_address, chain, market_cap, current_market_cap, buy_sell_ratio, volume_growth_rate, composite_score, outcome)
                            VALUES ($1, $2, $3, $4, $5, 1.0, 1.0, 0, 'PENDING')
                        `, [ticker, contractAddress, 'sol', mcap, mcap]);
                        
                        console.log(`✅ Recovered: $${ticker} (CA: ${contractAddress.substring(0,6)}...)`);
                        recoveredCount++;
                    }
                } catch (err) {
                    console.error("❌ Error parsing embed:", err.message);
                }
            }
        }
    }

    console.log(`\n🎉 Recovery Complete! Successfully injected ${recoveredCount} tokens back into PostgreSQL.`);
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);