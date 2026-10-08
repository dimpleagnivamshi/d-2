const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is required. Configure it in your Voroa environment.");
}
const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : false
});

// 1GB Rotation Configurations
const ROW_LIMIT = 1000000;      
const WIPE_THRESHOLD = 750000; 

let currentSheet = 1;
let rowCount = 0;
let isTruncating = false;

async function initializeStorage() {
    try {
        const maxIdRes = await pool.query("SELECT id FROM device2_telemetry_active_stream ORDER BY id DESC LIMIT 1");
        if (maxIdRes.rows.length > 0) {
            const maxId = maxIdRes.rows[0].id;
            for (let i = 1; i <= 3; i++) {
                const check = await pool.query(`SELECT id FROM device2_telemetry_${i} WHERE id = $1`, [maxId]);
                if (check.rows.length > 0) {
                    const countRes = await pool.query(`SELECT COUNT(*)::int as c FROM device2_telemetry_${i}`);
                    currentSheet = i;
                    rowCount = countRes.rows[0].c;
                    console.log(`Resuming Device 2 on Sheet ${i} with ${rowCount} rows.`);
                    return;
                }
            }
        }
    } catch (e) {
        console.log("Database initialized on fresh rotation loop for Device 2.");
    }
}

async function getFeedState() {
    const result = await pool.query("SELECT running, last_values FROM feed_state WHERE device_id = 'device-2'");
    return result.rows[0] || { running: false, last_values: {} };
}

async function setFeedState(running, lastValues) {
    const sql = "INSERT INTO feed_state (device_id, running, last_values, updated_at) VALUES ('device-2', $1, $2::jsonb, NOW()) " +
        "ON CONFLICT (device_id) DO UPDATE SET running = EXCLUDED.running, last_values = EXCLUDED.last_values, updated_at = NOW() " +
        "RETURNING running, last_values";
    const result = await pool.query(sql, [running, JSON.stringify(lastValues || {})]);
    return result.rows[0];
}

async function getLatestReading() {
    const result = await pool.query("SELECT id, payload FROM device2_telemetry_active_stream ORDER BY id DESC LIMIT 1");
    if (!result.rows.length) return null;
    return { id: Number(result.rows[0].id), ...result.rows[0].payload };
}

async function saveReading(row) {
    rowCount++;

    if (rowCount > ROW_LIMIT) {
        currentSheet = currentSheet === 3 ? 1 : currentSheet + 1;
        rowCount = 1; 
        console.log(`Rolled over to device2_telemetry_${currentSheet}`);
    }

    if (rowCount === WIPE_THRESHOLD && !isTruncating) {
        isTruncating = true;
        const sheetToWipe = currentSheet === 3 ? 1 : currentSheet + 1;
        pool.query(`TRUNCATE TABLE device2_telemetry_${sheetToWipe}`)
            .then(() => { isTruncating = false; })
            .catch(err => { console.error("Truncate failed:", err); isTruncating = false; });
    }

    const query = `INSERT INTO device2_telemetry_${currentSheet} (payload) VALUES ($1::jsonb) RETURNING id`;
    const result = await pool.query(query, [JSON.stringify(row)]);
    
    return { id: Number(result.rows[0].id), ...row };
}

async function listReadings(options) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 5000));
    let result;
    if (options.afterId != null) {
        result = await pool.query("SELECT id, payload FROM device2_telemetry_active_stream WHERE id > $1 ORDER BY id ASC LIMIT $2", [options.afterId, limit]);
    } else if (options.beforeId != null) {
        result = await pool.query("SELECT id, payload FROM device2_telemetry_active_stream WHERE id < $1 ORDER BY id DESC LIMIT $2", [options.beforeId, limit]);
    } else {
        result = await pool.query("SELECT id, payload FROM device2_telemetry_active_stream ORDER BY id DESC LIMIT $1", [limit]);
    }
    return result.rows.map(r => ({ id: Number(r.id), ...r.payload })).sort((a, b) => a.id - b.id);
}

async function getReadingCount() {
    const result = await pool.query("SELECT COUNT(*)::bigint AS count FROM device2_telemetry_active_stream");
    return Number(result.rows[0].count);
}

async function closeStorage() { await pool.end(); }

module.exports = { initializeStorage, getFeedState, setFeedState, getLatestReading, saveReading, listReadings, getReadingCount, closeStorage };