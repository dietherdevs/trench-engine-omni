const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialize Mid-Cap Support/Resistance Tracking Schema structural requirements [V2 spec]
const initSchema = async () => {
    const tableQuery = `
        CREATE TABLE IF NOT EXISTS midcap_watchlist (
            contract_address VARCHAR(100) PRIMARY KEY,
            chain VARCHAR(20) NOT NULL,
            symbol VARCHAR(50) NOT NULL,
            market_cap NUMERIC,
            liquidity NUMERIC,
            days_active INT DEFAULT 7,
            in_support_zone BOOLEAN DEFAULT FALSE,
            declining_volume BOOLEAN DEFAULT FALSE,
            bullish_reversal BOOLEAN DEFAULT FALSE,
            risk_badge VARCHAR(20) DEFAULT 'UNVERIFIED',
            invalidation_level NUMERIC,
            last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(tableQuery);
        console.log("💾 [POSTGRES] Mid-Cap Support & Resistance layout matrix synchronized successfully.");
    } catch (err) {
        console.error("❌ Schema sync failed:", err.message);
    }
};
initSchema();

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};