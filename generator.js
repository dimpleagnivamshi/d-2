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
        this.d1Url = process.env.DEVICE_1_URL || "https://d-1.getvoroa.com";
        this.wasD1ActiveLastCheck = true;
    }

    async initialize() {
        const state = await this.storage.getFeedState();
        this.values = { ...initialValues(), ...(state.last_values || {}) };
        const latest = await this.storage.getLatestReading();
        if (latest) {
            for (const key of Object.keys(DEFAULTS)) {
                if (Number.isFinite(Number(latest[key]))) this.values[key] = Number(latest[key]);
            }
        }
        await this.start();
    }

    async status() {
        const [count, latest] = await Promise.all([
            this.storage.getReadingCount(),
            this.storage.getLatestReading()
        ]);
        const d1Active = await this.checkD1Active();
        return {
            running: this.running,
            d1Active: d1Active,
            activeWorker: d1Active ? "d-1 (Primary Active)" : "d-2 (Redundant Failover Active)",
            count,
            latestId: latest ? latest.id : 0,
            latestTimestamp: latest ? latest.timestamp : null
        };
    }

    async checkD1Active() {
        try {
            const res = await fetch(`${this.d1Url}/api/status`, { 
                signal: AbortSignal.timeout(5000) 
            });
            if (res.ok) {
                const data = await res.json();
                return Boolean(data.running);
            }
        } catch {
            // Suppress minor network/abort errors during d-1 cold starts
        }
        return false;
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

        const d1IsActive = await this.checkD1Active();

        if (d1IsActive) {
            this.wasD1ActiveLastCheck = true;
            this.lastTickAt = Date.now();
            if (this.running) {
                this.schedule(this.tickMs);
            }
            return;
        }

        if (this.wasD1ActiveLastCheck) {
            const latest = await this.storage.getLatestReading();
            if (latest) {
                for (const key of Object.keys(DEFAULTS)) {
                    if (Number.isFinite(Number(latest[key]))) {
                        this.values[key] = Number(latest[key]);
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
            this.schedule(Math.max(0, this.lastTickAt + this.tickMs - Date.now()));
        }
    }
}

module.exports = { FeedGenerator, initialValues };