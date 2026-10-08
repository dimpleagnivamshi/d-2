/* GRAPH EXPLORER — history and new readings come from the backend. */
function initExplorer(settings) {
    settings = settings || {};
    const canvasId = settings.canvasId || "myChart";
    const xSelect = document.getElementById("xAxis");
    const ySelect = document.getElementById("yAxis");
    const timeSelect = document.getElementById("timeFormat");
    const timeControl = document.getElementById("timeFormatControl");

    fillColumnSelect("xAxis", { selected: settings.defaultX || "timestamp" });
    fillColumnSelect("yAxis", { includeTimestamp: false, selected: settings.defaultY || "P1" });
    let rows = [];

    function updateTimeControl() {
        if (timeControl) timeControl.style.display = xSelect.value === "timestamp" ? "flex" : "none";
    }
    function draw() {
        createChart(canvasId, rows, {
            x: xSelect.value,
            y: ySelect.value,
            timeFormat: timeSelect ? timeSelect.value : "minutes"
        });
    }

    xSelect.addEventListener("change", function () { updateTimeControl(); draw(); });
    ySelect.addEventListener("change", draw);
    if (timeSelect) timeSelect.addEventListener("change", draw);
    updateTimeControl();

    getLastLoggedRows(PLOT_MAX_POINTS).then(function (loadedRows) {
        rows = loadedRows;
        draw();
        onRealtimeTick(function (row, count) {
            rows.push(row);
            if (rows.length > PLOT_MAX_POINTS) rows.shift();
            appendPoint(canvasId, row, PLOT_MAX_POINTS);
            setStatus("Live readings: " + count, false);
        });
    }).catch(function (error) {
        console.error("Could not load Explorer history:", error);
        setStatus("Could not load live readings: " + error.message, true);
    });
}
initExplorer({ canvasId: "myChart", defaultX: "timestamp", defaultY: "P1" });
