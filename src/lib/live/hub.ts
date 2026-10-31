import "server-only";
import { Client } from "pg";
import { withDb } from "@/lib/db";
import { postgresConnectionString } from "@/lib/pg-url";
import { bumpVersion, readVersion } from "./version";

const CHANNEL = "order_events";
/** Neon suspends after 5 idle minutes. A newer change means the database is probably awake. */
const AWAKE_MS = 4 * 60_000;
const STANDBY_POLL_MS = 3_000;

export type LiveEvent = { kind: "order"; stadium: string; orderNumber: string; version: string } | { kind: "resync"; version: string };
type Listener = (event: LiveEvent) => void;

/**
 * One LISTEN connection per server instance, shared by every open stream.
 * LISTEN needs a direct connection; a transaction pooler drops it.
 *
 * When Neon suspends it closes the connection. Reconnecting would wake it, so the
 * hub waits in standby, watching the version counter, until a real change lands.
 * Streams then get a `resync` and refetch whatever they show.
 */
class Hub {
  private listeners = new Set<Listener>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private standby: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private seen: string | null = null;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    void this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.idle = setTimeout(() => void this.close(), 30_000);
    };
  }

  private async start() {
    if (this.client || this.connecting || this.standby) return;
    const version = await readVersion();
    if (this.client || this.connecting || this.standby) return;
    this.seen = version;
    if (version && Date.now() - parseInt(version, 36) < AWAKE_MS) void this.connect(false);
    else this.sleep();
  }

  private emit(event: LiveEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private connect(resync: boolean): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const url = postgresConnectionString(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
    const client = new Client({ connectionString: url });
    this.connecting = (async () => {
      try {
        await client.connect();
        client.on("notification", (message) => {
          const event = parse(message.payload);
          if (!event) return;
          this.seen = event.version;
          this.emit(event);
        });
        client.on("error", () => this.drop(client));
        client.on("end", () => this.drop(client));
        await client.query(`LISTEN ${CHANNEL}`);
        this.client = client;
        if (resync && this.seen) this.emit({ kind: "resync", version: this.seen });
      } catch {
        await client.end().catch(() => undefined);
        if (this.listeners.size > 0) setTimeout(() => void this.connect(resync), 5_000);
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  private drop(client: Client) {
    if (this.client !== client) return;
    this.client = null;
    if (this.listeners.size > 0) this.sleep();
  }

  private sleep() {
    if (this.standby) return;
    const tick = async () => {
      const version = await readVersion();
      if (this.listeners.size === 0) {
        this.standby = null;
        return;
      }
      if (version && version !== this.seen) {
        this.standby = null;
        this.seen = version;
        void this.connect(true);
        return;
      }
      this.standby = setTimeout(() => void tick(), STANDBY_POLL_MS);
    };
    this.standby = setTimeout(() => void tick(), STANDBY_POLL_MS);
  }

  private async close() {
    if (this.standby) clearTimeout(this.standby);
    this.standby = null;
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
  }
}

function parse(payload: string | undefined): LiveEvent | null {
  try {
    const value = JSON.parse(payload ?? "") as { stadium?: unknown; orderNumber?: unknown; version?: unknown };
    if (typeof value.stadium !== "string" || typeof value.orderNumber !== "string" || typeof value.version !== "string") return null;
    return { kind: "order", stadium: value.stadium, orderNumber: value.orderNumber, version: value.version };
  } catch {
    return null;
  }
}

const globalHub = globalThis as unknown as { orderHub?: Hub };

export function orderHub() {
  globalHub.orderHub ??= new Hub();
  return globalHub.orderHub;
}

/** Tell every open stream that an order changed. A missed notify is caught by the version counter on the next resync. */
export async function notifyOrder(stadium: string, orderNumber: string) {
  const version = await bumpVersion();
  const payload = JSON.stringify({ stadium, orderNumber, version });
  await withDb((db) => db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`).catch(() => undefined);
}
