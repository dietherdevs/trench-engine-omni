const db = require('./db');

/**
 * Compares an array of active token holders against our PostgreSQL smart money list
 */
async function scanForSmartMoney(chain, holdersArray) {
    try {
        if (!holdersArray || holdersArray.length === 0) return { count: 0, bonusPoints: 0 };

        // 1. Pull all tracked smart wallets for the specific blockchain
        const query = `SELECT wallet_address, win_rate FROM smart_wallets WHERE chain = $1`;
        const { rows: smartWallets } = await db.query(query, [chain]);

        if (smartWallets.length === 0) return { count: 0, bonusPoints: 0 };

        // Convert db list into a fast lookup Set
        const smartWalletSet = new Set(smartWallets.map(w => w.wallet_address.toLowerCase()));
        
        let detectedCount = 0;
        let totalWinRateBonus = 0;

        // 2. Intersect token holders with our smart money database
        for (const holder of holdersArray) {
            const cleanAddress = holder.address.toLowerCase();
            if (smartWalletSet.has(cleanAddress)) {
                detectedCount++;
                
                // Find matching profile data to extract historical performance weight
                const profile = smartWallets.find(w => w.wallet_address.toLowerCase() === cleanAddress);
                totalWinRateBonus += parseFloat(profile?.win_rate || 50); 
                
                console.log(`🎯 [SMART MONEY DETECTED] Elite Wallet [${cleanAddress.substring(0, 6)}] is holding this token!`);
            }
        }

        // Calculate a scaling mathematical point bonus (Max 20 bonus points)
        // More elite wallets with higher historical win rates increase confidence
        let bonusPoints = 0;
        if (detectedCount > 0) {
            bonusPoints = Math.min(Math.round((totalWinRateBonus / detectedCount) * 0.2 * detectedCount), 20);
        }

        return { count: detectedCount, bonusPoints };

    } catch (error) {
        console.error("❌ Smart Money Tracker DB Error:", error.message);
        return { count: 0, bonusPoints: 0 };
    }
}

module.exports = { scanForSmartMoney };