/* =====================================================
   COLUMN DEFINITIONS

   Add a new sensor column here once and it becomes
   available in every dropdown on every page.
   ===================================================== */

const COLUMNS = [
    { key: "timestamp", label: "Timestamp", time: true },
    { key: "P1", label: "P1" },
    { key: "P2", label: "P2" },
    { key: "dP", label: "dP" },
    { key: "RPM", label: "RPM" },
    { key: "dP_SetpointDiff", label: "dP Setpoint Difference" },
    { key: "TCS_dP_P1_P2", label: "TCS dP P1 P2" }
];

const COLUMN_LABELS = {};

COLUMNS.forEach(function (column) {
    COLUMN_LABELS[column.key] = column.label;
});

/* =====================================================
   AXIS LABEL
   ===================================================== */

function axisLabel(key, timeFormat) {
    if (key === "timestamp") {
        return "Timestamp (" + (timeFormat || "minutes") + ")";
    }

    return COLUMN_LABELS[key] || key;
}

/* =====================================================
   FILL A <select> WITH COLUMNS
   ===================================================== */

function fillColumnSelect(selectId, options) {
    const select = document.getElementById(selectId);

    if (!select) {
        return;
    }

    const includeTimestamp =
        options && options.includeTimestamp === false ? false : true;

    const selected = options ? options.selected : null;

    select.innerHTML = "";

    COLUMNS.forEach(function (column) {
        if (column.time && !includeTimestamp) {
            return;
        }

        const option = document.createElement("option");
        option.value = column.key;
        option.textContent = column.label;

        if (selected && selected === column.key) {
            option.selected = true;
        }

        select.appendChild(option);
    });
}

/* =====================================================
   FORMAT TIMESTAMP
   ===================================================== */

function formatTimestamp(timestamp, precision) {
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return null;
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    const hourText = String(hours).padStart(2, "0");
    const datePart = day + "-" + month + "-" + year;

    if (precision === "hours") {
        return datePart + " " + hourText + " " + ampm;
    }

    if (precision === "minutes") {
        return datePart + " " + hourText + ":" + minutes + " " + ampm;
    }

    if (precision === "seconds") {
        return (
            datePart +
            " " +
            hourText +
            ":" +
            minutes +
            ":" +
            seconds +
            " " +
            ampm
        );
    }

    return (
        datePart +
        " " +
        hourText +
        ":" +
        minutes +
        ":" +
        seconds +
        "." +
        milliseconds +
        " " +
        ampm
    );
}

/* =====================================================
   BUILD POINTS
   ===================================================== */

function getXValue(row, xKey) {
    if (xKey === "timestamp") {
        return new Date(row.timestamp).getTime();
    }

    return Number(row[xKey]);
}

function buildPoints(rows, xKey, yKey) {
    const points = [];

    rows.forEach(function (row) {
        if (!row.timestamp) {
            return;
        }

        const x = getXValue(row, xKey);
        const y = Number(row[yKey]);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        points.push({ x: x, y: y });
    });

    points.sort(function (a, b) {
        return a.x - b.x;
    });

    return points;
}

/* =====================================================
   TIME-BUCKET AVERAGING

   Used when a chart's precision is set to "minutes" or
   "hours": instead of plotting every raw reading, readings
   are grouped into fixed-size time windows and each window
   is plotted as ONE point — the average of everything that
   fell inside it. "seconds"/"milliseconds" buckets are the
   same size as (or smaller than) how often data actually
   arrives, so they come out looking like raw points.
   ===================================================== */

const BUCKET_MS = {
    milliseconds: 1,
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000
};

function bucketStartMs(timestampMs, precision) {
    const size = BUCKET_MS[precision] || 1000;
    return Math.floor(timestampMs / size) * size;
}

function buildAggregatedPoints(rows, xKey, yKey, precision) {
    if (xKey !== "timestamp") {
        return buildPoints(rows, xKey, yKey);
    }

    const buckets = new Map();

    rows.forEach(function (row) {
        if (!row.timestamp) {
            return;
        }

        const y = Number(row[yKey]);
        const t = new Date(row.timestamp).getTime();

        if (!Number.isFinite(y) || !Number.isFinite(t)) {
            return;
        }

        const key = bucketStartMs(t, precision);

        if (!buckets.has(key)) {
            buckets.set(key, { sum: 0, count: 0 });
        }

        const bucket = buckets.get(key);
        bucket.sum += y;
        bucket.count += 1;
    });

    const points = [];

    buckets.forEach(function (bucket, key) {
        points.push({ x: key, y: bucket.sum / bucket.count });
    });

    points.sort(function (a, b) {
        return a.x - b.x;
    });

    return points;
}

/* If the most recent bucket in a freshly-aggregated points list
   is still "open" (matches the bucket happening right now), pull
   it OFF the displayed list and hand it back separately as the
   bucket still being silently accumulated — so a not-yet-finished
   minute/hour never shows up on the chart as a partial value. */
function splitOpenBucket(points, yKey, rows, precision) {
    if (!points || points.length === 0) {
        return { displayPoints: points || [], currentBucket: null };
    }

    const last = points[points.length - 1];
    const nowBucket = bucketStartMs(Date.now(), precision);

    if (last.x === nowBucket) {
        const displayPoints = points.slice(0, -1);
        const currentBucket = computeCurrentBucket(rows, yKey, precision, [
            last
        ]);
        return { displayPoints: displayPoints, currentBucket: currentBucket };
    }

    return { displayPoints: points, currentBucket: null };
}

/* Works out the running sum/count for whichever bucket the
   LAST plotted point represents, so a live tick can keep
   averaging into it correctly instead of starting from zero. */
function computeCurrentBucket(rows, yKey, precision, points) {
    if (!points || points.length === 0) {
        return null;
    }

    const lastPoint = points[points.length - 1];
    let sum = 0;
    let count = 0;

    rows.forEach(function (row) {
        if (!row.timestamp) {
            return;
        }

        const t = new Date(row.timestamp).getTime();

        if (!Number.isFinite(t)) {
            return;
        }

        if (bucketStartMs(t, precision) === lastPoint.x) {
            const y = Number(row[yKey]);

            if (Number.isFinite(y)) {
                sum += y;
                count += 1;
            }
        }
    });

    return { key: lastPoint.x, sum: sum, count: count };
}

/* =====================================================
   CHART REGISTRY

   Keeps one chart per canvas id, so redrawing a chart
   destroys the previous instance automatically.
   ===================================================== */

const chartRegistry = {};

/* =====================================================
   CREATE CHART

   createChart("myChart", rows, {
       x: "timestamp",
       y: "P1",
       timeFormat: "minutes",
       title: "P1 vs Time",   // optional
       compact: false          // true -> smaller fonts, no title
   });
   ===================================================== */

function createChart(canvasId, rows, settings) {
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        return null;
    }

    rows = rows || [];

    const xKey = settings.x || "timestamp";
    const yKey = settings.y;
    const compact = settings.compact === true;

    /* A shared, mutable settings object. Callbacks below close
       over THIS object (not a plain variable), so changing
       liveSettings.timeFormat later — via setChartPrecision() —
       is picked up immediately, without rebuilding the chart. */
    const liveSettings = {
        xKey: xKey,
        yKey: yKey,
        timeFormat: settings.timeFormat || "minutes",
        aggregate: settings.aggregate === true,
        currentBucket: null
    };

    let points = liveSettings.aggregate
        ? buildAggregatedPoints(rows, xKey, yKey, liveSettings.timeFormat)
        : buildPoints(rows, xKey, yKey);

    if (liveSettings.aggregate) {
        const split = splitOpenBucket(
            points,
            yKey,
            rows,
            liveSettings.timeFormat
        );
        points = split.displayPoints;
        liveSettings.currentBucket = split.currentBucket;
    }

    if (chartRegistry[canvasId]) {
        chartRegistry[canvasId].destroy();
    }

    const title =
        settings.title !== undefined
            ? settings.title
            : axisLabel(yKey) + " vs " + axisLabel(xKey, liveSettings.timeFormat);

    chartRegistry[canvasId] = new Chart(canvas, {
        type: "scatter",

        data: {
            datasets: [
                {
                    label: axisLabel(yKey),
                    data: points,
                    showLine: settings.showLine !== false,
                    borderWidth: compact ? 1.5 : 2,
                    borderColor: settings.color || "#2563eb",
                    backgroundColor: settings.color || "#2563eb",
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "nearest",
                intersect: false
            },

            plugins: {
                legend: {
                    display: !compact,
                    position: "top"
                },

                title: {
                    display: !compact && title !== null,
                    text: title,
                    font: { size: 20 }
                },

                tooltip: {
                    callbacks: {
                        title: function (items) {
                            if (xKey === "timestamp") {
                                return formatTimestamp(
                                    items[0].parsed.x,
                                    liveSettings.timeFormat
                                );
                            }

                            return (
                                axisLabel(xKey) + ": " + items[0].parsed.x
                            );
                        }
                    }
                }
            },

            scales: {
                x: {
                    type: "linear",

                    title: {
                        display: true,
                        text: axisLabel(xKey, liveSettings.timeFormat),
                        font: {
                            size: compact ? 12 : 15,
                            weight: "bold"
                        }
                    },

                    ticks: {
                        maxTicksLimit: compact ? 6 : 10,
                        maxRotation: 0,
                        autoSkip: true,

                        callback: function (value) {
                            if (xKey === "timestamp") {
                                return formatTimestamp(
                                    value,
                                    liveSettings.timeFormat
                                );
                            }

                            return value;
                        }
                    }
                },

                y: {
                    title: {
                        display: true,
                        text: axisLabel(yKey),
                        font: {
                            size: compact ? 12 : 15,
                            weight: "bold"
                        }
                    }
                }
            }
        }
    });

    /* Same object the callbacks above already closed over —
       mutating it later (setChartPrecision) changes what they
       print, without needing to rebuild the chart. */
    chartRegistry[canvasId].liveSettings = liveSettings;

    return chartRegistry[canvasId];
}

/* =====================================================
   CHANGE A CHART'S TIMESTAMP PRECISION LIVE

   Only meaningful when that chart's X-axis is "timestamp".
   Updates the axis title immediately and redraws — no data
   is touched, only how the timestamps are displayed.
   ===================================================== */

async function setChartPrecision(canvasId, newFormat) {
    const chart = chartRegistry[canvasId];

    if (!chart || !chart.liveSettings) {
        return;
    }

    chart.liveSettings.timeFormat = newFormat;

    if (chart.liveSettings.xKey !== "timestamp") {
        chart.update();
        return;
    }

    chart.options.scales.x.title.text = axisLabel("timestamp", newFormat);

    /* Averaging charts (Dashboard) need to be rebuilt from the
       full raw log at the new bucket size — minutes/hours group
       many raw readings into one averaged point, so we can't
       just relabel the points already on screen. */
    if (chart.liveSettings.aggregate && typeof getAllLoggedRows === "function") {
        try {
            const rows = await getAllLoggedRows();
            const yKey = chart.liveSettings.yKey;

            let points = buildAggregatedPoints(
                rows,
                "timestamp",
                yKey,
                newFormat
            );

            const split = splitOpenBucket(points, yKey, rows, newFormat);
            points = split.displayPoints;

            if (
                typeof PLOT_MAX_POINTS !== "undefined" &&
                points.length > PLOT_MAX_POINTS
            ) {
                points = points.slice(-PLOT_MAX_POINTS);
            }

            chart.data.datasets[0].data = points;
            chart.liveSettings.currentBucket = split.currentBucket;
        } catch (error) {
            console.error("Could not re-aggregate chart for new precision", error);
        }
    }

    chart.update();
}

/* =====================================================
   APPEND ONE LIVE POINT TO AN EXISTING CHART

   Adds a single new reading to a chart already drawn by
   createChart(), without rebuilding it. Used for real-time
   feeds. Older points drop off once maxPoints is reached
   so the chart doesn't slow down over a long-running feed.
   ===================================================== */

function appendPoint(canvasId, row, maxPoints) {
    const chart = chartRegistry[canvasId];

    if (!chart || !chart.liveSettings) {
        return;
    }

    const xKey = chart.liveSettings.xKey;
    const yKey = chart.liveSettings.yKey;
    const y = Number(row[yKey]);

    if (!Number.isFinite(y)) {
        return;
    }

    const data = chart.data.datasets[0].data;

    /* AGGREGATING CHART (Dashboard, timestamp X-axis):
       average this reading into the current time bucket rather
       than always adding a new point. "seconds"/"milliseconds"
       buckets are the same size as (or smaller than) how often
       readings arrive, so every tick still lands in a new
       bucket — behaving just like a raw point either way. */
    if (chart.liveSettings.aggregate && xKey === "timestamp") {
        const t = new Date(row.timestamp).getTime();

        if (!Number.isFinite(t)) {
            return;
        }

        const precision = chart.liveSettings.timeFormat;
        const bucketKey = bucketStartMs(t, precision);
        const current = chart.liveSettings.currentBucket;

        if (current && current.key === bucketKey) {
            /* Still inside the same minute/hour — fold this
               reading into the running average SILENTLY. Nothing
               is drawn yet, so the chart doesn't pulse every
               second while a bucket is still filling up. */
            current.sum += y;
            current.count += 1;
            return;
        }

        /* Crossed into a new minute/hour: the bucket we were just
           accumulating (if any) is now finished — plot it as one
           real point, and THIS is the only moment the chart
           redraws for that whole minute/hour. */
        if (current && current.count > 0) {
            data.push({ x: current.key, y: current.sum / current.count });

            if (maxPoints && data.length > maxPoints) {
                data.shift();
            }

            chart.update("none");
        }

        /* Start the next bucket silently — it won't appear on the
           chart until IT finishes too. */
        chart.liveSettings.currentBucket = {
            key: bucketKey,
            sum: y,
            count: 1
        };

        return;
    }

    /* NON-AGGREGATING CHART (Graph Explorer, Pressure Analysis,
       or any non-timestamp X-axis): unchanged — one raw point
       per reading. */
    const x =
        xKey === "timestamp"
            ? new Date(row.timestamp).getTime()
            : Number(row[xKey]);

    if (!Number.isFinite(x)) {
        return;
    }

    data.push({ x: x, y: y });

    if (maxPoints && data.length > maxPoints) {
        data.shift();
    }

    chart.update("none");
}

/* =====================================================
   BUILD A GRID OF CHARTS

   buildChartGrid("chartGrid", rows, [
       { title: "P1 vs Time", x: "timestamp", y: "P1" },
       ...
   ], "minutes");
   ===================================================== */

function buildChartGrid(containerId, rows, cards, timeFormat) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    container.innerHTML = "";

    cards.forEach(function (card, index) {
        const canvasId = containerId + "_chart_" + index;

        const wrapper = document.createElement("div");
        wrapper.className = "chart-card";

        const heading = document.createElement("h2");
        heading.textContent =
            card.title || axisLabel(card.y) + " vs " + axisLabel(card.x);

        const canvas = document.createElement("canvas");
        canvas.id = canvasId;

        wrapper.appendChild(heading);
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        createChart(canvasId, rows, {
            x: card.x,
            y: card.y,
            color: card.color,
            timeFormat: card.timeFormat || timeFormat || "minutes",
            compact: true,
            title: null
        });
    });
}