const express = require("express");
const { Pool } = require("pg");
const client = require("prom-client");

const app = express();
const port = process.env.PORT || 3002;

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const writesTotal = new client.Counter({
  name: "writer_db_inserts_total",
  help: "Total rows inserted into PostgreSQL",
});

const writeFailuresTotal = new client.Counter({
  name: "writer_db_insert_failures_total",
  help: "Total failed PostgreSQL inserts",
});

register.registerMetric(writesTotal);
register.registerMetric(writeFailuresTotal);

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS heartbeat (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      note TEXT
    )
  `);
}

async function waitForPostgres(retries = 20, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("PostgreSQL is ready");
      return;
    } catch (err) {
      console.log(`Waiting for PostgreSQL... attempt ${i}/${retries}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("PostgreSQL did not become ready in time");
}

async function writeRow() {
  try {
    await pool.query("INSERT INTO heartbeat (note) VALUES ($1)", ["periodic write"]);
    writesTotal.inc();
    console.log("Inserted one row");
  } catch (err) {
    writeFailuresTotal.inc();
    console.error("Insert failed:", err.message);
  }
}

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

(async () => {
  try {
    await waitForPostgres();
    await init();
    setInterval(writeRow, 5000);
    app.listen(port, () => {
      console.log(`writer-service listening on ${port}`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();