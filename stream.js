function createStreamHub(storage) {
    const clients = new Set();
    function send(client, row) {
        client.res.write("id: " + row.id + "\nevent: reading\ndata: " + JSON.stringify(row) + "\n\n");
        client.lastId = row.id;
    }
    async function handle(req, res, url) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        });
        res.write("retry: 2000\n\n");
        const client = { res, ready: false, pending: [], lastId: 0 };
        clients.add(client);
        const requested = req.headers["last-event-id"] || url.searchParams.get("afterId") || "0";
        client.lastId = Math.max(0, Number(requested) || 0);
        try {
            let cursor = client.lastId;
            while (true) {
                const replay = await storage.listReadings({ afterId: cursor, limit: 5000 });
                for (const row of replay) {
                    if (row.id > client.lastId) send(client, row);
                    cursor = Math.max(cursor, row.id);
                }
                if (replay.length < 5000) break;
            }
            client.ready = true;
            client.pending.sort((a, b) => a.id - b.id);
            for (const row of client.pending) if (row.id > client.lastId) send(client, row);
            client.pending = [];
        } catch (error) {
            console.error("SSE replay failed:", error);
            res.end(); clients.delete(client); return;
        }
        const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": heartbeat\n\n"); }, 20000);
        const cleanup = () => { clearInterval(heartbeat); clients.delete(client); };
        req.on("aborted", cleanup); res.on("close", cleanup);
    }
    function publish(row) {
        for (const client of clients) {
            if (!client.ready) client.pending.push(row);
            else if (row.id > client.lastId) send(client, row);
        }
    }
    return { handle, publish };
}
module.exports = { createStreamHub };


