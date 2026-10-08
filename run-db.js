const { Client } = require('pg');
const fs = require('fs');

// 1. Go to your Voroa database page and click the "Connect" tab.
// 2. Copy the connection string (it starts with postgres://).
// 3. Paste it inside the quotes below. Leave ?sslmode=require at the end.
const connectionString = "postgres://postgres:jK1DlPT07Xte5vr-Zzaf5pmsrq1dPoMJ@db-f1c4b8453015.db.getvoroa.com:20972/postgres?sslmode=require"; 

const client = new Client({
    connectionString: connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log("Connected to Voroa Database!");
        
        // This reads the SQL file containing your 3-sheet database logic
        const sql = fs.readFileSync('./db/migrations/001_initial.sql', 'utf8');
        await client.query(sql);
        
        console.log("Success: Tables and View created.");
    } catch (err) {
        console.error("Error creating tables:", err);
    } finally {
        await client.end();
    }
}

runMigration();