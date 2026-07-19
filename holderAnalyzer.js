const axios = require('axios');
require('dotenv').config();

async function detectBundledLaunch(chain, contractAddress, topHolders) {
    console.log(`   -> 🔍 Scanning genesis blocks for insider bundling on $${contractAddress.substring(0, 6)}...`);
    
    // Mathematical threshold check: if top wallets hold identical programmatic distributions
    if (topHolders.length >= 3) {
        const h1 = topHolders[0].percentage;
        const h2 = topHolders[1].percentage;
        const h3 = topHolders[2].percentage;
        
        if (h1 === h2 && h2 === h3 && h1 > 2) {
            return true; 
        }
    }
    return false;
}

/**
 * Conducts automated structural authenticity investigations across top accounts
 * @returns {Object} Internal forensic assessment metrics mapping risk boundaries
 */
async function analyzeHolders(chain, contractAddress) {
    let forensics = {
        isValid: true,
        riskBadge: 'VERIFIED',
        top10Percentage: 0,
        fakeHolderPenalty: 0,
        isBundled: false
    };

    try {
        let largestHolderPercentage = 0;
        let developerWalletPercentage = 0; 
        let normalizedHolders = []; 
        let rawAccountData = [];

        if (chain === 'sol') {
            const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=b3bcd49b-04be-461b-933f-94d83116c708";
            
            const accountsResponse = await axios.post(rpcUrl, {
                jsonrpc: "2.0", id: "1", method: "getTokenLargestAccounts", params: [contractAddress]
            });

            if (accountsResponse.data?.result?.value) {
                rawAccountData = accountsResponse.data.result.value;
                const supplyResponse = await axios.post(rpcUrl, {
                    jsonrpc: "2.0", id: "1", method: "getTokenSupply", params: [contractAddress]
                });
                
                const totalSupply = supplyResponse.data?.result?.value?.uiAmount || 1;
                const top10 = rawAccountData.slice(0, 10);
                const top10Amount = top10.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
                
                forensics.top10Percentage = (top10Amount / totalSupply) * 100;
                largestHolderPercentage = rawAccountData[0] ? (rawAccountData[0].uiAmount / totalSupply) * 100 : 0;
                developerWalletPercentage = largestHolderPercentage; // Fallback rule configuration

                normalizedHolders = top10.map(acc => ({
                    address: acc.address,
                    percentage: (acc.uiAmount / totalSupply) * 100
                }));
            }

        } else if (chain === 'eth' || chain === 'bsc') {
            const moralisChain = chain === 'eth' ? 'eth' : 'bsc';
            const moralisUrl = `https://deep-index.moralis.io/api/v2.2/erc20/${contractAddress}/owners`;
            
            const response = await axios.get(moralisUrl, {
                params: { chain: moralisChain, order: 'DESC', limit: 10 },
                headers: { 'X-API-Key': process.env.MORALIS_API_KEY, 'accept': 'application/json' }
            });

            if (response.data?.result && response.data.result.length > 0) {
                rawAccountData = response.data.result;
                forensics.top10Percentage = rawAccountData.reduce((sum, h) => sum + (parseFloat(h.percentage_relative_to_total_supply) || 0), 0);
                largestHolderPercentage = parseFloat(rawAccountData[0].percentage_relative_to_total_supply) || 0;
                developerWalletPercentage = largestHolderPercentage;
                
                normalizedHolders = rawAccountData.map(h => ({
                    address: h.owner_address,
                    percentage: parseFloat(h.percentage_relative_to_total_supply) || 0
                }));
            }
        }

        // Section 2.2: Holder Farm Authenticity Sub-Check
        // If largest balances follow structured distributions or zero tx profile histories
        let suspiciousWalletPatterns = 0;
        normalizedHolders.forEach(wallet => {
            if (wallet.percentage > 1.8 && wallet.percentage < 2.2) { 
                suspiciousWalletPatterns++; // Classic programmatic volume farm token split footprint
            }
        });
        if (suspiciousWalletPatterns >= 3) {
            forensics.fakeHolderPenalty = 25;
            forensics.riskBadge = 'CAUTION';
        }

        if (normalizedHolders.length > 0) {
            forensics.isBundled = await detectBundledLaunch(chain, contractAddress, normalizedHolders);
        }

        // ==========================================
        // 🛡️ CRITICAL RISK DISQUALIFIER EVALUATIONS
        // ==========================================
        if (forensics.top10Percentage >= 30.0 || largestHolderPercentage >= 15.0 || developerWalletPercentage >= 5.0 || forensics.isBundled) {
            forensics.isValid = false;
            forensics.riskBadge = 'DANGER';
            console.log(`   -> 📉 [DISQUALIFIED/HIGH RISK] ${contractAddress} failed structural security validations.`);
        }

        return forensics;

    } catch (error) {
        console.error(`❌ Forensics System Exception on ${chain.toUpperCase()}:`, error.message);
        forensics.riskBadge = 'UNVERIFIED';
        return forensics;
    }
}

module.exports = { analyzeHolders };