// test.js
require('dotenv').config();
const { fetchTrendingTokens } = require('./gmgnEngine');

async function dryRun() {
    console.log("🚀 Starting Trench Engine V1.0 Test Scan...");
    console.log("------------------------------------------------");
    
    // Test Solana first since Helius is fully operational
    console.log("🤖 Running SOLANA market scan...");
    const solTokens = await fetchTrendingTokens('sol');
    
    console.log(`\n✅ Scan complete. Found ${solTokens.length} tokens that passed early volume thresholds.`);
    if (solTokens.length > 0) {
        console.log("Sample Token Evaluated:", solTokens[0]);
    }

    console.log("\n------------------------------------------------");
    console.log("测试 Engine execution completed successfully!");
    process.exit(0);
}

dryRun();