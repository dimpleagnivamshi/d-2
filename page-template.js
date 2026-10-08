/* TEMPLATE PAGE — live history and ticks come from the backend. */
const PAGE_CHARTS = [
    { title: "RPM vs Time", x: "timestamp", y: "RPM", color: "#9333ea" },
    { title: "dP vs RPM", x: "RPM", y: "dP", color: "#ea580c" }
];

getLastLoggedRows(PLOT_MAX_POINTS).then(function (rows) {
    buildChartGrid("chartGrid", rows, PAGE_CHARTS, "seconds");
    onRealtimeTick(function (row) {
        PAGE_CHARTS.forEach(function (chart, index) {
            appendPoint("chartGrid_chart_" + index, row, PLOT_MAX_POINTS);
        });
    });
}).catch(function (error) {
    console.error("Could not load template page history:", error);
    setStatus("Could not load live readings: " + error.message, true);
});
