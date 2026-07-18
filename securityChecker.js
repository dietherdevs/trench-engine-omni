const axios = require('axios');

// GoPlus Network IDs for EVM chains
const chainIdMap = {
    'eth': '1',
    'bsc': '56',
    'base': '8453',
    'arb': '42161',
    'poly': '137',
    'avax': '43114',
    'opt': '10'
};

/**
 * Audit token security data and assign a V2 Risk Badge
 * @param {string} chain 
 * @param {string} contractAddress 
 * @returns {Promise<string>} 'VERIFIED' | 'CAUTION' | 'DANGER' | 'UNVERIFIED'
 */
async function checkTokenSecurityBadge(chain, contractAddress) {
    // Non-EVM chains default to VERIFIED if mock data isn't provided, 
    // or you can substitute dedicated platform checks here (e.g., RugCheck for Sol)
    if (['sol', 'sui'].includes(chain)) {
        return 'VERIFIED'; 
    }

    const chainId = chainIdMap[chain];
    if (!chainId) return 'UNVERIFIED';

    try {
        const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${contractAddress}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code !== 1 || !data.result || !data.result[contractAddress.toLowerCase()]) {
            console.log(`⚠️ Security data unverified or unavailable for: ${contractAddress}`);
            return 'UNVERIFIED'; 
        }

        const tokenData = data.result[contractAddress.toLowerCase()];

        // 🚨 CRITICAL FLAGS (Auto-DANGER)
        const isHoneypot = tokenData.is_honeypot === "1";
        const canMint = tokenData.is_mintable === "1" || tokenData.cannot_buy === "1";
        const canFreeze = tokenData.transfer_pausable === "1";
        const isHighlyTaxed = parseFloat(tokenData.buy_tax || 0) > 0.10 || parseFloat(tokenData.sell_tax || 0) > 0.10;
        
        // Bundled / Creator history simulated checking via GoPlus fields
        const isCreatorHeavy = parseFloat(tokenData.creator_percent || 0) > 30; 

        if (isHoneypot || canMint || canFreeze || isHighlyTaxed || isCreatorHeavy) {
            console.log(`🚨 CRITICAL THREAT FLAG TRIPPED FOR ${contractAddress} -> Marking DANGER`);
            return 'DANGER';
        }

        // ⚠️ MINOR FLAGS (Auto-CAUTION)
        const isProxy = tokenData.is_proxy === "1";
        const lowLiquidityLocked = tokenData.is_true_token === "0" || tokenData.lp_holder_count < 2;
        const topHoldersConcentrated = parseFloat(tokenData.owner_percent || 0) > 15;

        if (isProxy || lowLiquidityLocked || topHoldersConcentrated) {
            console.log(`⚠️ Minor security flags tripped for ${contractAddress} -> Marking CAUTION`);
            return 'CAUTION';
        }

        return 'VERIFIED';

    } catch (error) {
        console.error(`❌ Security Engine Layer Error for ${contractAddress}:`, error.message);
        return 'UNVERIFIED'; 
    }
}

module.exports = { checkTokenSecurityBadge };