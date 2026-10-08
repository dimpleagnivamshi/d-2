-- Create the metadata table for feed state
CREATE TABLE IF NOT EXISTS feed_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
    running BOOLEAN DEFAULT FALSE,
    last_values JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ensure_singleton CHECK (singleton)
);

-- Insert the default starting state
INSERT INTO feed_state (singleton, running, last_values) 
VALUES (TRUE, FALSE, '{}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

-- Create the 3 rotating data sheets
CREATE TABLE IF NOT EXISTS telemetry_data_1 (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_data_2 (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_data_3 (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL
);

-- Drop the old view safely and recreate it
DROP VIEW IF EXISTS telemetry_active_stream;

CREATE VIEW telemetry_active_stream AS
SELECT id, payload FROM telemetry_data_1
UNION ALL
SELECT id, payload FROM telemetry_data_2
UNION ALL
SELECT id, payload FROM telemetry_data_3;