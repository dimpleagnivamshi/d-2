const DEFAULTS = {
    P1: { start: 2.348, min: 1.138, max: 3.034, volatility: 0.04 },
    P2: { start: 1.023, min: 0.948, max: 1.138, volatility: 0.004 },
    dP: { start: 1.325, min: 0.001, max: 2.012, volatility: 0.04 },
    RPM: { start: 1883.676, min: 542, max: 2395, volatility: 35 },
    dP_SetpointDiff: { start: -0.039, min: -1.710, max: 1.992, volatility: 0.06 },
    TCS_dP_P1_P2: { start: 1.363, min: 0, max: 2.0, volatility: 0.04 }
};

function initialValues() {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, cfg]) => [key, cfg.start]));
}

function nextValue(previous, cfg) {
    const randomStep = (Math.random() - 0.5) * 2 * cfg.volatility;
    const pullToStart = (cfg.start - previous) * 0.02;
    return Math.max(cfg.min, Math.min(cfg.max, previous + randomStep + pullToStart));
}

class FeedGenerator {
    constructor(storage, stream, tickMs = 1000) {
        this.storage = storage;
        this.stream = stream;
        this.tickMs = tickMs;
        this.timer = null;
        this.running = false;
        this.values = initialValues();
        this.lastTickAt = 0;
        this.wasD1ActiveLastCheck = true;
    }

    async initialize() {
        const state = await this.storage.getFeedState();
        this.values = { ...initialValues(), ...(state.last_values || {}) };
        const latest = await this.storage.getLatestReading();
        if (latest) {
            for (const key of Object.keys(DEFAULTS)) {
                const val = latest[key] !== undefined ? latest[key] : (latest.payload && latest.payload[key]);
                if (Number.isFinite(Number(val))) this.values[key] = Number(val);
            }
        }
        await this.start();
    }

    async status() {
        const [count, latest, d1State] = await Promise.all([
            this.storage.getReadingCount(),
            this.storage.getLatestReading(),
            this.storage.getD1FeedState()
        ]);
        const d1Active = Boolean(d1State && d1State.running);
        return {
            running: this.running,
            d1Active: d1Active,
            activeWorker: d1Active ? "d-1 (Primary Active)" : "d-2 (Redundant Failover Active)",
            count,
            latestId: latest ? latest.id : 0,
            latestTimestamp: latest ? latest.timestamp : null
        };
    }

    async start() {
        if (this.running) return this.status();
        this.running = true;
        this.lastTickAt = Date.now();
        this.schedule(this.tickMs);
        return this.status();
    }

    async stop() {
        this.running = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        return this.status();
    }

    schedule(delay) {
        if (this.running) this.timer = setTimeout(() => this.tick(), delay);
    }

    async tick() {
        if (!this.running) return;

        const d1State = await this.storage.getD1FeedState();
        const d1IsActive = Boolean(d1State && d1State.running);

        if (d1IsActive) {
            this.wasD1ActiveLastCheck = true;
            this.lastTickAt = Date.now();
            if (this.running) {
                const elapsed = Date.now() - this.lastTickAt;
                const nextDelay = Math.max(0, this.tickMs - elapsed);
                this.schedule(nextDelay);
            }
            return;
        }

        if (this.wasD1ActiveLastCheck) {
            const latest = await this.storage.getLatestReading();
            if (latest) {
                for (const key of Object.keys(DEFAULTS)) {
                    const val = latest[key] !== undefined ? latest[key] : (latest.payload && latest.payload[key]);
                    if (Number.isFinite(Number(val))) {
                        this.values[key] = Number(val);
                    }
                }
            }
            this.wasD1ActiveLastCheck = false;
        }

        const now = Date.now();
        const row = { timestamp: new Date(now).toISOString() };

        for (const [key, cfg] of Object.entries(DEFAULTS)) {
            this.values[key] = nextValue(this.values[key], cfg);
            row[key] = this.values[key];
        }

        try {
            const saved = await this.storage.saveReading(row);
            this.stream.publish(saved);
        } catch (error) {
            console.error("D-2 failover reading could not be persisted", error);
        }

        this.lastTickAt = now;
        if (this.running) {
            const elapsed = Date.now() - now;
            const nextDelay = Math.max(0, this.tickMs - elapsed);
            this.schedule(nextDelay);
        }
    }
}

module.exports = { FeedGenerator, initialValues };