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

async function isTokenSafe(chain, contractAddress) {
    // Non-EVM chains bypass GoPlus contract auditing
    if (['sol', 'sui'].includes(chain)) return true; 

    const chainId = chainIdMap[chain];
    if (!chainId) return false;

    try {
        const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${contractAddress}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code !== 1 || !data.result || !data.result[contractAddress.toLowerCase()]) {
            console.log(`⚠️ Unverified contract layout: ${contractAddress}`);
            return false; 
        }

        const tokenData = data.result[contractAddress.toLowerCase()];

        if (tokenData.is_honeypot === "1") {
            console.log(`🚨 HONEYPOT DETECTED: Dropping ${contractAddress}`);
            return false;
        }

        const buyTax = parseFloat(tokenData.buy_tax || 0) * 100;
        const sellTax = parseFloat(tokenData.sell_tax || 0) * 100;
        if (buyTax > 10 || sellTax > 10) {
            console.log(`🚨 HIGH TAX DETECTED (${buyTax}% / ${sellTax}%): Dropping ${contractAddress}`);
            return false;
        }

        if (tokenData.is_proxy === "1" || tokenData.transfer_pausable === "1") {
            console.log(`🚨 RISKY CONTEXT PRIVILEGES DETECTED: Dropping ${contractAddress}`);
            return false;
        }

        return true;

    } catch (error) {
        console.error(`❌ GoPlus Security API Error for ${contractAddress}:`, error.message);
        return false; 
    }
}

module.exports = { isTokenSafe };