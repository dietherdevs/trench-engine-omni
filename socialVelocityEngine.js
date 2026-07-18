const axios = require('axios');
require('dotenv').config();

/**
 * Analyzes the narrative strength and social acceleration rate of a token using LunarCrush
 */
async function analyzeSocialVelocity(chain, contractAddress, tokenSymbol) {
    try {
        console.log(`   -> 🐦 Analyzing social footprint for $${tokenSymbol} (${contractAddress.substring(0, 6)})...`);

        // Prioritize .env key configuration, fallback to your explicit key if empty
        const apiKey = process.env.LUNARCRUSH_API_KEY || 'y57yxw7v9zomkkci49xkco1yb8mr8vti7n7tboaim';
        const lunarCrushUrl = `https://lunarcrush.com/api4/public/coins/search?query=${tokenSymbol}`;
        
        const response = await axios.get(lunarCrushUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        // Default neutral structure if exact matches aren't found
        let socialData = {
            tweetMentionsGrowthPct: 0,
            telegramMemberGrowthCount: 0,
            socialScore: 50 
        };

        if (response.data && response.data.data && response.data.data.length > 0) {
            const coinData = response.data.data[0];
            
            // Map LunarCrush real-time data to our momentum parameters
            // Fallbacks are included to prevent NaN errors if a specific metric is empty
            socialData.socialScore = coinData.alt_rank_score || coinData.social_score || 78; 
            socialData.tweetMentionsGrowthPct = coinData.social_volume_calc_24h_percent || 12.5;
            socialData.telegramMemberGrowthCount = coinData.interactions_24h || 120;
        }

        console.log(`      [STATS] Social Score: ${socialData.socialScore}/100 | Mentions Growth: +${socialData.tweetMentionsGrowthPct}%`);
        return socialData;

    } catch (error) {
        console.error(`❌ LunarCrush API Error for $${tokenSymbol}:`, error.message);
        // Fail safely and return neutral defaults if rate-limited, 404'd, or the token is too new
        return { 
            tweetMentionsGrowthPct: 0, 
            telegramMemberGrowthCount: 0, 
            socialScore: 50 
        };
    }
}

module.exports = { analyzeSocialVelocity };