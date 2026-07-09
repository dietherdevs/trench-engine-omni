const { Client } = require('pg');

// Replace this string with your copied EXTERNAL Database URL from Render
const EXTERNAL_URL = "postgresql://trench_db_b77p_user:j2wLQqG6CUn6ttiBQfketOYd67AaNUHq@dpg-d97jal8k1i2s73e83e8g-a.oregon-postgres.render.com/trench_db_b77p";

const client = new Client({
    connectionString: EXTERNAL_URL,
    ssl: { rejectUnauthorized: false } // This completely bypasses the SNI/SSL error you just got
});

async function runSetup() {
    try {
        console.log("Connecting to Render Cloud DB...");
        await client.connect();
        
        console.log("Creating token_history table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS token_history (
                id SERIAL PRIMARY KEY,
                ticker VARCHAR(50),
                contract_address VARCHAR(255) UNIQUE,
                chain VARCHAR(50),
                market_cap NUMERIC,
                current_market_cap NUMERIC,
                ath_recorded NUMERIC,
                ath_multiplier NUMERIC DEFAULT 1.0,
                outcome VARCHAR(50) DEFAULT 'PENDING',
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log("✅ SUCCESS! Table created in the cloud!");
    } catch (error) {
        console.error("❌ ERROR:", error.message);
    } finally {
        await client.end();
    }
}

runSetup();