/* PRESSURE ANALYSIS — backend history, live chart append, and summary. */
const PRESSURE_CHARTS = [
    { title: "P1 vs Time", x: "timestamp", y: "P1", color: "#2563eb" },
    { title: "P2 vs Time", x: "timestamp", y: "P2", color: "#16a34a" },
    { title: "dP vs Time", x: "timestamp", y: "dP", color: "#dc2626" },
    { title: "P2 vs P1", x: "P1", y: "P2", color: "#7c3aed" }
];

withRealtimeData(function (loadedRows) {
    const rows = loadedRows.slice();
    buildChartGrid("chartGrid", rows.slice(-PLOT_MAX_POINTS), PRESSURE_CHARTS, "seconds");
    renderSummaryTable("summary", summarise(rows, ["P1", "P2", "dP", "RPM"]));
    onRealtimeTick(function (row, count) {
        rows.push(row);
        PRESSURE_CHARTS.forEach(function (chart, index) {
            appendPoint("chartGrid_chart_" + index, row, PLOT_MAX_POINTS);
        });
        renderSummaryTable("summary", summarise(rows, ["P1", "P2", "dP", "RPM"]));
        setStatus("Live readings: " + count, false);
    });
});

function summarise(rows, keys) {
    return keys.map(function (key) {
        const values = rows.map(function (row) { return Number(row[key]); }).filter(Number.isFinite);
        if (!values.length) return { key: key, count: 0 };
        const sum = values.reduce(function (a, b) { return a + b; }, 0);
        return { key: key, count: values.length, min: Math.min.apply(null, values), max: Math.max.apply(null, values), avg: sum / values.length };
    });
}
function renderSummaryTable(containerId, summary) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = "<table class='data-table'><thead><tr><th>Signal</th><th>Samples</th><th>Min</th><th>Max</th><th>Average</th></tr></thead><tbody>";
    summary.forEach(function (item) {
        html += "<tr><td>" + axisLabel(item.key) + "</td><td>" + item.count + "</td><td>" +
            (item.count ? item.min.toFixed(2) : "-") + "</td><td>" +
            (item.count ? item.max.toFixed(2) : "-") + "</td><td>" +
            (item.count ? item.avg.toFixed(2) : "-") + "</td></tr>";
    });
    container.innerHTML = html + "</tbody></table>";
}
