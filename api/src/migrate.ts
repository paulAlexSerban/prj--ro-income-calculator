import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

function ident(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

async function main() {
  const admin = new pg.Client({ connectionString: config.databaseUrlAdmin });
  await admin.connect();
  const user = ident(config.appDbUser);
  const database = ident(config.postgresDb);
  try {
    const existing = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [config.appDbUser]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE ROLE ${user} LOGIN PASSWORD ${literal(config.appDbPassword)}`);
    } else {
      await admin.query(`ALTER ROLE ${user} LOGIN PASSWORD ${literal(config.appDbPassword)}`);
    }
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${user}`);
    await admin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${user}`);

    await admin.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const done = await admin.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
      if (done.rowCount) continue;
      const body = readFileSync(path.join(migrationsDir, file), "utf8");
      await admin.query("BEGIN");
      try {
        await admin.query(body);
        await admin.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
        await admin.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await admin.query("ROLLBACK");
        throw error;
      }
    }

    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${user}`);
    await admin.query(`REVOKE ALL ON TABLE schema_migrations FROM ${user}`);
    console.log("migrations complete");
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
