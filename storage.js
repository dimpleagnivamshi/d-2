const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeStorage() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS device2_telemetry_active_stream (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL,
            payload JSONB NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS feed_state (
            key VARCHAR(50) PRIMARY KEY,
            running BOOLEAN NOT NULL,
            last_values JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
    `);
}

async function getFeedState() {
    const res = await pool.query("SELECT running, last_values FROM feed_state WHERE key = 'd2_state'");
    if (res.rows.length === 0) return { running: false, last_values: {} };
    return res.rows[0];
}

async function setFeedState(running, values) {
    await pool.query(`
        INSERT INTO feed_state (key, running, last_values, updated_at)
        VALUES ('d2_state', $1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET running = $1, last_values = $2, updated_at = NOW()
    `, [running, JSON.stringify(values)]);
}

async function saveReading(reading) {
    const timestamp = reading.timestamp || new Date().toISOString();
    const res = await pool.query(
        "INSERT INTO device2_telemetry_active_stream (timestamp, payload) VALUES ($1, $2) RETURNING id, timestamp, payload",
        [timestamp, JSON.stringify(reading)]
    );
    const row = res.rows[0];
    return { id: row.id, timestamp: row.timestamp, ...row.payload };
}

async function getLatestReading() {
    const res = await pool.query("SELECT id, timestamp, payload FROM device2_telemetry_active_stream ORDER BY id DESC LIMIT 1");
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { id: row.id, timestamp: row.timestamp, ...row.payload };
}

async function getReadingCount() {
    const res = await pool.query("SELECT COUNT(*) FROM device2_telemetry_active_stream");
    return parseInt(res.rows[0].count, 10);
}

async function closeStorage() {
    await pool.end();
}

module.exports = {
    initializeStorage,
    getFeedState,
    setFeedState,
    saveReading,
    getLatestReading,
    getReadingCount,
    closeStorage
};