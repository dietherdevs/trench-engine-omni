const axios = require('axios');
require('dotenv').config();

// Ensure you have a separate MIDCAP_WEBHOOK_URL in your .env file
const MIDCAP_WEBHOOK = process.env.MIDCAP_WEBHOOK_URL; 

async function sendMidCapAlert(token, invalidationLevel) {
    if (!MIDCAP_WEBHOOK) return;

    const embed = {
        title: `🎯 V2 DIP SETUP: $${token.symbol}`,
        description: `A mid-cap setup has passed the 7-Point Technical Checklist.`,
        color: 3447003, // Blue color to differentiate from green/red trench alerts
        fields: [
            {
                name: "📊 Market Cap",
                value: `$${(token.market_cap / 1000000).toFixed(2)}M`,
                inline: true
            },
            {
                name: "⏳ Days Active",
                value: `${token.days_active} Days`,
                inline: true
            },
            {
                name: "🛡️ Risk Badge",
                value: token.risk_badge,
                inline: true
            },
            {
                name: "✅ Technicals",
                value: "✔️ In Support Zone\n✔️ Declining Sell Volume\n✔️ Bullish Reversal Candle",
                inline: false
            },
            {
                name: "🛑 Invalidation (Stop Loss)",
                value: `$${invalidationLevel.toFixed(6)}`,
                inline: false
            }
        ],
        footer: {
            text: "Trench Engine V2 • Mid-Cap Radar"
        },
        timestamp: new Date().toISOString()
    };

    try {
        await axios.post(MIDCAP_WEBHOOK, { embeds: [embed] });
        console.log(`✅ Mid-Cap Discord Alert fired for $${token.symbol}`);
    } catch (error) {
        console.error(`❌ Failed to send Mid-Cap Discord alert:`, error.message);
    }
}

module.exports = { sendMidCapAlert };