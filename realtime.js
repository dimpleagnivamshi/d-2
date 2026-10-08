/* Browser client for the backend-owned live feed. No generation or browser database. */

// 1. Updated API_BASE_URL to point to your live Voroa backend instead of the local server
const API_BASE_URL = window.SENSOR_API_BASE_URL || "https://device-2.getvoroa.com";

const LIVE_PAGE_LIMIT = 5000;
let lastKnownReadingId = 0;
let knownReadingCount = 0;
let eventSource = null;
let streamConnecting = false;

// 2. Declared feedControlSecret to prevent ReferenceErrors in strict mode
let feedControlSecret = null; 

const tickListeners = [];

async function apiRequest(path, options) {
    const response = await fetch(API_BASE_URL + path, {
        headers: { "Accept": "application/json", ...(options && options.headers || {}) },
        ...options
    });
    if (!response.ok) {
        let detail = "";
        try { detail = (await response.json()).error || ""; } catch {}
        const error = new Error(detail || ("Backend request failed (" + response.status + ")"));
        error.status = response.status;
        throw error;
    }
    return response.json();
}

async function getFeedStatus() {
    const status = await apiRequest("/api/status");
    knownReadingCount = status.count;
    return status;
}

async function getLastLoggedRows(limit) {
    const result = await apiRequest("/api/readings?limit=" + encodeURIComponent(limit || 1000));
    if (result.rows.length) lastKnownReadingId = Math.max(lastKnownReadingId, result.rows[result.rows.length - 1].id);
    knownReadingCount = result.count;
    return result.rows;
}

async function getAllLoggedRows() {
    const rows = [];
    let afterId = 0;
    let serverCount = 0;
    while (true) {
        const result = await apiRequest("/api/readings?limit=" + LIVE_PAGE_LIMIT + "&afterId=" + afterId);
        serverCount = result.count;
        if (!result.rows.length) break;
        rows.push(...result.rows);
        afterId = result.rows[result.rows.length - 1].id;
        if (result.rows.length < LIVE_PAGE_LIMIT) break;
    }
    if (rows.length) lastKnownReadingId = Math.max(lastKnownReadingId, rows[rows.length - 1].id);
    knownReadingCount = serverCount;
    return rows;
}

async function getLoggedRowCount() {
    return (await getFeedStatus()).count;
}

function getFeedControlSecret() {
    if (feedControlSecret) return feedControlSecret;
    const entered = window.prompt("Enter the backend feed-control secret:");
    if (entered === null || !entered.trim()) throw new Error("Feed control cancelled.");
    feedControlSecret = entered.trim();
    return feedControlSecret;
}

async function postFeedControl(action) {
    const secret = getFeedControlSecret();
    try {
        return await apiRequest("/api/feed/" + action, {
            method: "POST",
            headers: { "Authorization": "Bearer " + secret }
        });
    } catch (error) {
        if (error.status === 401) feedControlSecret = null;
        throw error;
    }
}

async function startRealtimeFeed() {
    return postFeedControl("start");
}

async function stopRealtimeFeed() {
    return postFeedControl("stop");
}

function onRealtimeTick(callback) {
    tickListeners.push(callback);
    if (eventSource || streamConnecting) return;
    streamConnecting = true;
    const historyCursor = lastKnownReadingId;
    const source = new EventSource(API_BASE_URL + "/api/stream?afterId=" + encodeURIComponent(historyCursor));
    eventSource = source;
    source.addEventListener("reading", function (event) {
        try {
            const row = JSON.parse(event.data);
            if (row.id <= lastKnownReadingId) return;
            lastKnownReadingId = row.id;
            knownReadingCount += 1;
            tickListeners.forEach(function (fn) {
                try { fn(row, knownReadingCount); } catch (error) { console.error("Live reading listener failed:", error); }
            });
        } catch (error) {
            console.error("Could not parse a live reading:", error);
        }
    });
    source.onerror = function () {
        streamConnecting = false;
        if (source.readyState === EventSource.CLOSED) eventSource = null;
    };
    source.onopen = function () { streamConnecting = false; };
}

async function exportLogToExcel() {
    if (typeof XLSX === "undefined") throw new Error("Excel export library is unavailable.");
    const rows = await getAllLoggedRows();
    if (!rows.length) {
        alert("No live data has been logged yet.");
        return;
    }
    const cleanRows = rows.map(function (row) {
        const copy = Object.assign({}, row);
        delete copy.id;
        return copy;
    });
    const worksheet = XLSX.utils.json_to_sheet(cleanRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Live Log");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(workbook, "live_sensor_log_" + stamp + ".xlsx");
}