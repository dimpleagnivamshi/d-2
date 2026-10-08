const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Automatically locate where dashboard.html lives across any folder structure
let projectRoot = __dirname;
const possibleRoots = [
    __dirname,
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../..")
];

for (const root of possibleRoots) {
    if (fs.existsSync(path.join(root, "dashboard.html")) || fs.existsSync(path.join(root, "index.html"))) {
        projectRoot = root;
        break;
    }
}

const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
};

function loadConfig() {
    const envFile = path.resolve(projectRoot, ".env");
    if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envFile);
    }

    const databaseUrlStr = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_O9ucklhRI0Eq@ep-red-sea-b4a065l9-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    try {
        new URL(databaseUrlStr);
    } catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }

    const secret = (process.env.FEED_CONTROL_SECRET || "default_secure_secret_12345").trim();

 let frontendOrigin = process.env.FRONTEND_ORIGIN || "";
    if (process.env.FRONTEND_ORIGIN) {
        try {
            const frontend = new URL(process.env.FRONTEND_ORIGIN);
            frontendOrigin = frontend.origin;
        } catch {}
    }
    

    // Defaulting to 3001 so it doesn't conflict with Device 1 locally
    const rawPort = process.env.PORT || "3001";
    const port = Number(rawPort);
    const host = (process.env.HOST || "0.0.0.0").trim();
    process.env.PGSSL = (process.env.PGSSL || "false").toLowerCase();

    return {
        host,
        port,
        frontendOrigin,
        feedControlSecret: secret
    };
}

function corsAllowed(req, res, config) {
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (!origin) return true;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
}

async function main() {
    const config = loadConfig();
    const storage = require("./storage");
    const { FeedGenerator } = require("./generator");
    const { createStreamHub } = require("./stream");
    const { createRoutes } = require("./routes");

    await storage.initializeStorage();
    const stream = createStreamHub(storage);
    const generator = new FeedGenerator(storage, stream);
    await generator.initialize();
    const routes = createRoutes(storage, generator, stream, config);

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
            if (req.method === "GET" && url.pathname === "/healthz") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                return res.end(JSON.stringify({ status: "ok" }));
            }
            if (url.pathname.startsWith("/api/")) {
                if (!corsAllowed(req, res, config)) {
                    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
                    return res.end(JSON.stringify({ error: "Origin is not allowed." }));
                }
                if (req.method === "OPTIONS") {
                    res.writeHead(204);
                    return res.end();
                }

                // ==========================================
                // DEVICE 2 CUSTOM INTERRUPT 
                // ==========================================
                if (req.method === "POST" && url.pathname === "/api/device2/interrupt") {
                    let body = '';
                    req.on('data', chunk => { body += chunk.toString(); });
                    req.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            const result = generator.toggleInterrupt(parsed.interrupt);
                            console.log(`Device 2 Interrupted: ${parsed.interrupt}`);
                            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                            res.end(JSON.stringify(result));
                        } catch (err) {
                            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                            res.end(JSON.stringify({ error: "Invalid JSON provided" }));
                        }
                    });
                    return; 
                }
                // ==========================================

                const handled = await routes.handle(req, res, url);
                if (handled !== false) return;
                res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
                return res.end(JSON.stringify({ error: "API route not found" }));
            }
            serveStatic(url.pathname, res);
        } catch (error) {
            console.error("Request failed:", error);
            if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            if (!res.destroyed) res.end(JSON.stringify({ error: "Internal server error" }));
        }
    });

    server.listen(config.port, config.host, () => {
        console.log(`Sensor app listening on ${config.host}:${config.port} (Serving static from: ${projectRoot})`);
    });

    const shutdown = async () => {
        server.close();
        await storage.closeStorage();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

function serveStatic(requestPath, res) {
    let decoded;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        res.writeHead(400);
        return res.end("Bad path");
    }

    if (decoded === "/") {
        if (fs.existsSync(path.join(projectRoot, "dashboard.html"))) {
            decoded = "/dashboard.html";
        } else {
            decoded = "/index.html";
        }
    }

    const file = path.resolve(projectRoot, "." + decoded);
    
    if (!file.startsWith(projectRoot) || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end("Not found");
    }

    const type = mime[path.extname(file).toLowerCase()];
    if (!type) {
        res.writeHead(404);
        return res.end("Not found");
    }

    fs.readFile(file, (error, content) => {
        if (error) {
            res.writeHead(500);
            return res.end("Read error");
        }
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
        res.end(content);
    });
}

main().catch((error) => {
    console.error("Backend startup failed:", error.message);
    process.exitCode = 1;
});