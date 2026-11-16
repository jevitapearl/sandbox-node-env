const express = require("express");
const { Pool } = require("pg");

const required = ["APP_NAME", "API_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing required env vars: " + missing.join(", "));
  process.exit(1);
}

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.get("/", (req, res) =>
  res.json({ app: process.env.APP_NAME, log_level: process.env.LOG_LEVEL || "info", database_configured: !!pool })
);
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/secret", (req, res) => {
  if (req.get("x-api-key") !== process.env.API_KEY) return res.status(401).json({ error: "bad api key" });
  res.json({ secret: "the env var reached the container" });
});

async function ensureTable() {
  await pool.query("CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())");
}
app.get("/db", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query("SELECT version() AS version");
    res.json({ connected: true, version: r.rows[0].version });
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});
app.get("/api/notes", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "DATABASE_URL not set" });
  try { await ensureTable(); const r = await pool.query("SELECT * FROM notes ORDER BY id"); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/notes", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "DATABASE_URL not set" });
  if (!req.body || !req.body.text) return res.status(400).json({ error: "text is required" });
  try {
    await ensureTable();
    const r = await pool.query("INSERT INTO notes(text) VALUES($1) RETURNING *", [String(req.body.text)]);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`));
