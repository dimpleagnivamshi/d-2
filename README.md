# Sensor Data Analysis

The Node.js backend is the only generator and source of truth for live sensor readings. It writes readings to PostgreSQL and serves history over HTTP and new readings over Server-Sent Events. Dashboard, Graph Explorer, Pressure Analysis, and the page template consume this backend. The Excel workbook is not used as an input source.

## Backend files

- server/src/generator.js generates one reading per second.
- server/src/storage.js persists readings and feed state to PostgreSQL.
- server/src/routes.js implements status, history, start, and stop endpoints.
- server/src/stream.js sends stored readings to connected browsers and replays missed events.
- server/src/server.js validates configuration, applies CORS, and serves the API and existing frontend pages.
- server/db/migrations/001_initial.sql creates the PostgreSQL tables.

## Configuration

Copy server/.env.example to server/.env and set:

- DATABASE_URL — PostgreSQL connection URL.
- PGSSL — true or false, according to the database provider.
- HOST — bind host; defaults to 0.0.0.0.
- PORT — listen port; defaults to 3000.
- FEED_CONTROL_SECRET — replace the sample with a unique random secret of at least 32 characters. Dashboard prompts for it when you first use Start/Stop and keeps it in page memory only.
- FRONTEND_ORIGIN — one exact frontend origin, such as https://app.example.com (no path). Wildcard origins are not supported.

Do not commit server/.env or expose FEED_CONTROL_SECRET in frontend source. Feed-control requests use a Bearer token. Status, history, and the SSE stream are read-only and remain unauthenticated.

## Local setup

Requirements: Node.js 20 or newer and PostgreSQL.

1. Create a PostgreSQL database and login, for example sensor_app.
2. Configure server/.env using the settings above. For local same-origin use, FRONTEND_ORIGIN should match the browser URL, such as http://localhost:3000.
3. From the server directory, run npm install, then npm start.
4. Open the frontend at the matching origin. The backend applies the initial SQL migration on startup.
5. On Dashboard, use Start Live Feed. The backend continues when Dashboard and all browser tabs are closed. Use Stop Live Feed to stop it.

The generator is process-local and must run in exactly one server instance. Do not scale this deployment to multiple replicas.

## API

- GET /api/status — feed state, reading count, latest ID and timestamp.
- GET /api/readings?limit=1000 — latest history (maximum page size 5,000).
- GET /api/readings?afterId=123&limit=1000 — later rows in ascending ID order.
- GET /api/readings?beforeId=123&limit=1000 — earlier history.
- GET /api/stream?afterId=123 — SSE reading stream with event IDs and replay.
- POST /api/feed/start — start the shared feed; requires Bearer authorization.
- POST /api/feed/stop — stop the shared feed; requires Bearer authorization.

Each reading preserves timestamp, P1, P2, dP, RPM, dP_SetpointDiff, and TCS_dP_P1_P2. The API adds an id for ordering and SSE replay.

## Before online deployment

Use an always-on Node service and persistent PostgreSQL. Configure HOST, PORT, DATABASE_URL, PGSSL, FEED_CONTROL_SECRET, and FRONTEND_ORIGIN through the hosting environment. Terminate TLS at the platform or a trusted proxy, enable database backups, and plan data retention. Keep exactly one generator instance. The configured frontend origin is the only browser origin allowed by CORS; feed controls also require the secret.

The Dashboard Excel download exports backend history; it does not load the workbook as graph input.
