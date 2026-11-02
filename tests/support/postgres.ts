import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { applyTestEnv, assertTestDatabaseUrl, TEST_DATABASE_NAME, TEST_PG_PORT, testDatabaseUrl } from "./env";

type Cluster = {
  url: string;
  stop?: () => Promise<void>;
};

let cluster: Cluster | null = null;
let embedded: EmbeddedPostgres | null = null;

const APP_TABLES = [
  '"AuditEvent"',
  '"OrderItem"',
  '"Order"',
  '"Payment"',
  '"Option"',
  '"OptionGroup"',
  '"Product"',
  '"Category"',
  '"Section"',
  '"Receipt"',
  '"SeatMap"',
  '"PushSubscription"',
  '"StaffMember"',
  '"VenueAdmin"',
  '"Stadium"',
  '"twoFactor"',
  '"session"',
  '"account"',
  '"verification"',
  '"user"',
];

/** Prefer CI's Postgres service when TEST_DATABASE_URL is set; otherwise start embedded-postgres. */
export async function startTestDatabase(): Promise<string> {
  if (cluster) return cluster.url;

  if (process.env.TEST_DATABASE_URL) {
    assertTestDatabaseUrl(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
    applyTestEnv({ databaseUrl: process.env.TEST_DATABASE_URL });
    await migrate(process.env.TEST_DATABASE_URL);
    await seed(process.env.TEST_DATABASE_URL);
    cluster = { url: process.env.TEST_DATABASE_URL };
    return cluster.url;
  }

  const databaseDir = path.join(os.tmpdir(), `stadium-pg-${TEST_PG_PORT}`);
  // A previous run that was interrupted can leave its postmaster alive, which makes initdb fail with
  // "pre-existing shared memory block is still in use".
  killPostmaster(databaseDir);
  fs.rmSync(databaseDir, { recursive: true, force: true });
  fs.mkdirSync(databaseDir, { recursive: true });

  embedded = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: TEST_PG_PORT,
    persistent: false,
    onLog: () => undefined,
    onError: (message) => console.error("[embedded-postgres]", message),
  });

  await embedded.initialise();
  await embedded.start();
  try {
    await embedded.createDatabase(TEST_DATABASE_NAME);
  } catch {
    /* already exists on a reused cluster */
  }

  const url = testDatabaseUrl(TEST_PG_PORT);
  applyTestEnv({ databaseUrl: url });
  await migrate(url);
  await seed(url);

  cluster = {
    url,
    stop: async () => {
      gracefulStop(databaseDir);
      if (embedded) {
        await embedded.stop().catch(() => undefined);
        embedded = null;
      }
      // On Windows embedded-postgres' fire-and-forget taskkill can leave the postmaster behind.
      killPostmaster(databaseDir);
      // Windows can keep the data files locked for a moment after postgres exits; the next run wipes the directory anyway.
      try {
        fs.rmSync(databaseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* best effort */
      }
    },
  };
  return url;
}

export async function stopTestDatabase() {
  if (cluster?.stop) await cluster.stop();
  cluster = null;
}

export async function resetDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; call startTestDatabase first");
  assertTestDatabaseUrl(url, "DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`TRUNCATE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
  await seed(url);
}

/** Kill whatever postmaster `postmaster.pid` in this data directory names, if it is still running. */
function killPostmaster(databaseDir: string) {
  let pid: number;
  try {
    pid = Number.parseInt(fs.readFileSync(path.join(databaseDir, "postmaster.pid"), "utf8").split(/\r?\n/)[0], 10);
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    // Pids get recycled: only kill it if it is still a postgres.
    const probe = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
    if (/postgres/i.test(probe.stdout ?? "")) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGINT");
    } catch {
      /* already gone */
    }
  }
}

/**
 * embedded-postgres stops by `taskkill /f /t` on Windows, which can leave the shutdown checkpointer running
 * as an orphan that keeps the shared-memory block (and the next run's initdb) blocked. `pg_ctl stop` is clean.
 */
function gracefulStop(databaseDir: string) {
  if (process.platform !== "win32") return;
  const pgCtl = path.join(process.cwd(), "node_modules", "@embedded-postgres", "windows-x64", "native", "bin", "pg_ctl.exe");
  if (!fs.existsSync(pgCtl) || !fs.existsSync(path.join(databaseDir, "postmaster.pid"))) return;
  spawnSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "30"], { stdio: "ignore" });
}

const ROOT = process.cwd();

/**
 * `prisma.config.ts` and `prisma/seed.ts` both call `dotenv.config({ path: ".env.local", override: true })`,
 * which would REPLACE the test DATABASE_URL with the developer's real (Neon) one. Running the children from an
 * empty directory means dotenv finds no env files, so the URL we pass is the one that is used.
 */
function isolatedCwd() {
  const dir = path.join(os.tmpdir(), "stadium-pg-runner");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function childEnv(url: string) {
  assertTestDatabaseUrl(url, "DATABASE_URL");
  return { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, TSX_TSCONFIG_PATH: path.join(ROOT, "tsconfig.json") };
}

function migrate(url: string) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--config", path.join(ROOT, "prisma.config.ts")],
    { encoding: "utf8", cwd: isolatedCwd(), env: childEnv(url) },
  );
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);
  }
}

function seed(url: string) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(ROOT, "prisma", "seed.ts")], {
    encoding: "utf8",
    cwd: isolatedCwd(),
    env: childEnv(url),
  });
  if (result.status !== 0) {
    throw new Error(`prisma seed failed:\n${result.stdout}\n${result.stderr}`);
  }
}
