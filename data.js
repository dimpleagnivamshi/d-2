/* Live data facade: all history comes from the backend API. */
const PLOT_MAX_POINTS = 100;
function withRealtimeData(callback) {
    setStatus("Loading live readings...");
    return getAllLoggedRows().then(function (rows) {
        setStatus(rows.length
            ? "Live readings loaded. " + rows.length + " rows found."
            : "No live readings yet. Start the feed from the Dashboard.");
        callback(rows);
        return rows;
    }).catch(function (error) {
        console.error("Could not load live readings:", error);
        setStatus("Could not load live readings: " + error.message, true);
    });
}
function setStatus(message, isError) {
    const element = document.getElementById("status");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("status-error", isError === true);
}
