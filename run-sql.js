const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_J6WOQcLK1RFf@ep-wispy-dream-b53mp93o-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const sqlScript = `
-- Drop existing state table to apply multi-device schema cleanly
DROP TABLE IF EXISTS feed_state CASCADE;

-- ==========================================
-- 1. DEVICE 1 TABLES & STATE
-- ==========================================
CREATE TABLE feed_state (
    device_id VARCHAR(50) PRIMARY KEY,
    running BOOLEAN NOT NULL DEFAULT FALSE,
    last_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO feed_state (device_id, running) 
VALUES ('device-1', FALSE) 
ON CONFLICT (device_id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS telemetry_id_seq;

CREATE TABLE IF NOT EXISTS telemetry_data_1 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_data_2 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_data_3 (
    id BIGINT PRIMARY KEY DEFAULT nextval('telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP VIEW IF EXISTS telemetry_active_stream;
CREATE VIEW telemetry_active_stream AS
SELECT id, payload, created_at FROM telemetry_data_1
UNION ALL
SELECT id, payload, created_at FROM telemetry_data_2
UNION ALL
SELECT id, payload, created_at FROM telemetry_data_3;

-- ==========================================
-- 2. DEVICE 2 TABLES & STATE
-- ==========================================
INSERT INTO feed_state (device_id, running) 
VALUES ('device-2', FALSE) 
ON CONFLICT (device_id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS device2_telemetry_id_seq;

CREATE TABLE IF NOT EXISTS device2_telemetry_1 (
    id BIGINT PRIMARY KEY DEFAULT nextval('device2_telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device2_telemetry_2 (
    id BIGINT PRIMARY KEY DEFAULT nextval('device2_telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device2_telemetry_3 (
    id BIGINT PRIMARY KEY DEFAULT nextval('device2_telemetry_id_seq'),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP VIEW IF EXISTS device2_telemetry_active_stream;
CREATE VIEW device2_telemetry_active_stream AS
SELECT id, payload, created_at FROM device2_telemetry_1
UNION ALL
SELECT id, payload, created_at FROM device2_telemetry_2
UNION ALL
SELECT id, payload, created_at FROM device2_telemetry_3;
`;

async function runMigration() {
  try {
    await client.connect();
    console.log("Connected to Neon database. Executing multi-device migration...");
    await client.query(sqlScript);
    console.log("✅ Complete Multi-Device 3-Sheet architecture successfully applied!");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await client.end();
  }
}

runMigration();