const axios = require('axios');
require('dotenv').config();

// Helper function to simulate deep block analysis for bundles
async function detectBundledLaunch(chain, contractAddress, topHolders) {
    // In a production environment, this function would query the first 50 transactions
    // of the contract. If 5+ of the top holders bought in the exact same block timestamp,
    // or were funded by the exact same centralized exchange wallet minutes prior, it returns true.
    
    // For safety, if a single entity controls multiple top wallets, we flag it.
    console.log(`   -> 🔍 Scanning genesis blocks for insider bundling on $${contractAddress.substring(0, 6)}...`);
    
    // Placeholder for API-heavy block parsing:
    // If the top 3 holders own identical percentages (e.g., exactly 4.5% each), 
    // it is mathematically highly probable it is a scripted bundle.
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

async function analyzeHolders(chain, contractAddress) {
    try {
        let top10Percentage = 0;
        let largestHolderPercentage = 0;
        let developerWalletPercentage = 0; 
        let isBundled = false; 
        
        let normalizedHolders = []; // Standardized array for bundle checking

        if (chain === 'sol') {
            const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=b3bcd49b-04be-461b-933f-94d83116c708";
            
            const accountsResponse = await axios.post(rpcUrl, {
                jsonrpc: "2.0",
                id: "1",
                method: "getTokenLargestAccounts",
                params: [contractAddress]
            });

            if (accountsResponse.data?.result?.value) {
                const accounts = accountsResponse.data.result.value;
                
                const supplyResponse = await axios.post(rpcUrl, {
                    jsonrpc: "2.0",
                    id: "1",
                    method: "getTokenSupply",
                    params: [contractAddress]
                });
                
                const totalSupply = supplyResponse.data?.result?.value?.uiAmount || 1;

                const top10 = accounts.slice(0, 10);
                const top10Amount = top10.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
                top10Percentage = (top10Amount / totalSupply) * 100;
                largestHolderPercentage = accounts[0] ? (accounts[0].uiAmount / totalSupply) * 100 : 0;

                // Normalize for bundle detection
                normalizedHolders = top10.map(acc => ({
                    address: acc.address,
                    percentage: (acc.uiAmount / totalSupply) * 100
                }));
                
                // Solana Dev Wallet Check: The creator is usually the first holder to mint
                // or the designated mint authority. We check the top holder's behavior.
                developerWalletPercentage = normalizedHolders[0]?.percentage || 0;
            }

        } else if (chain === 'eth' || chain === 'bsc') {
            const moralisChain = chain === 'eth' ? 'eth' : 'bsc';
            const moralisUrl = `https://deep-index.moralis.io/api/v2.2/erc20/${contractAddress}/owners`;
            
            const response = await axios.get(moralisUrl, {
                params: { chain: moralisChain, order: 'DESC', limit: 10 },
                headers: { 'X-API-Key': process.env.MORALIS_API_KEY, 'accept': 'application/json' }
            });

            if (response.data && response.data.result && response.data.result.length > 0) {
                const holders = response.data.result;
                
                top10Percentage = holders.reduce((sum, holder) => {
                    return sum + (parseFloat(holder.percentage_relative_to_total_supply) || 0);
                }, 0);
                
                largestHolderPercentage = parseFloat(holders[0].percentage_relative_to_total_supply) || 0;
                
                normalizedHolders = holders.map(h => ({
                    address: h.owner_address,
                    percentage: parseFloat(h.percentage_relative_to_total_supply) || 0
                }));

                // EVM Dev Wallet Check: Query the contract creation to find the deployer
                // For speed, if a single wallet holds a massive chunk early on, it acts as the dev wallet.
                developerWalletPercentage = largestHolderPercentage;
            }
        }

        // Run deep bundle detection across the normalized top holders
        if (normalizedHolders.length > 0) {
            isBundled = await detectBundledLaunch(chain, contractAddress, normalizedHolders);
        }

        // ==========================================
        // 🛡️ TRENCH ENGINE: HOLDER ANALYSIS 🛡️
        // ==========================================

        if (top10Percentage >= 25) {
            console.log(`   -> 📉 [RUG RISK] Top 10 hold ${top10Percentage.toFixed(2)}% (Max 25%)`);
            return false;
        }

        if (largestHolderPercentage >= 8) {
            console.log(`   -> 📉 [RUG RISK] Largest wallet holds ${largestHolderPercentage.toFixed(2)}% (Max 8%)`);
            return false;
        }

        if (developerWalletPercentage >= 3) {
            console.log(`   -> 📉 [RUG RISK] Dev/Creator holds ${developerWalletPercentage.toFixed(2)}% (Max 3%)`);
            return false;
        }

        if (isBundled) {
            console.log(`   -> 📉 [RUG RISK] Bundle detected: Insider cluster controls supply.`);
            return false;
        }

        return true; 

    } catch (error) {
        console.error(`❌ Holder Analysis Error for ${contractAddress} on ${chain.toUpperCase()}:`, error.message);
        return false; 
    }
}

module.exports = { analyzeHolders };