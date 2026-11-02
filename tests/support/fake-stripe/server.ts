import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { URL } from "node:url";

export type StripeScenario = "succeed" | "requires_action" | "decline" | "processing" | "network_error";

type Intent = {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  customer: string | null;
  client_secret: string;
  status: string;
  metadata: Record<string, string>;
  last_payment_error?: { message: string; decline_code?: string } | null;
};

type Customer = { id: string; object: "customer"; metadata: Record<string, string> };
type Refund = { id: string; object: "refund"; payment_intent: string; status: string };

let scenario: StripeScenario = "succeed";
let seq = 0;
const intents = new Map<string, Intent>();
const customers = new Map<string, Customer>();
const refunds = new Map<string, Refund>();
const idempotency = new Map<string, unknown>();
/** Every Idempotency-Key header seen since the last reset, newest last. */
const seenIdempotencyKeys: string[] = [];

export function setStripeScenario(next: StripeScenario) {
  scenario = next;
}

export function resetFakeStripe() {
  scenario = "succeed";
  seq = 0;
  intents.clear();
  customers.clear();
  refunds.clear();
  idempotency.clear();
  seenIdempotencyKeys.length = 0;
}

export function listIdempotencyKeys() {
  return [...seenIdempotencyKeys];
}

function nextId(prefix: string) {
  seq += 1;
  return `${prefix}_test_${seq}`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    const key = decodeURIComponent(k.replace(/\+/g, " "));
    const value = decodeURIComponent(v.replace(/\+/g, " "));
    out[key] = value;
  }
  return out;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function statusForCreate(): string {
  if (scenario === "decline") return "requires_payment_method";
  if (scenario === "requires_action") return "requires_action";
  if (scenario === "processing") return "processing";
  return "requires_payment_method";
}

function statusForConfirm(): string {
  if (scenario === "decline") return "requires_payment_method";
  if (scenario === "requires_action") return "requires_action";
  if (scenario === "processing") return "processing";
  return "succeeded";
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (scenario === "network_error") {
    res.destroy();
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/^\/v1/, "");
  const method = req.method ?? "GET";
  // Readiness probe for Playwright's webServer (it only accepts 2xx/3xx/401-403, never the 404 fallthrough).
  if (method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("fake-stripe ready");
    return;
  }
  const body = method === "GET" || method === "DELETE" ? "" : await readBody(req);
  const form = parseForm(body);
  const idem = req.headers["idempotency-key"];
  if (typeof idem === "string") {
    seenIdempotencyKeys.push(idem);
    if (idempotency.has(idem) && method !== "GET") {
      json(res, 200, idempotency.get(idem));
      return;
    }
  }

  if (method === "POST" && path === "/customers") {
    const customer: Customer = {
      id: nextId("cus"),
      object: "customer",
      metadata: Object.fromEntries(
        Object.entries(form)
          .filter(([k]) => k.startsWith("metadata["))
          .map(([k, v]) => [k.slice(9, -1), v]),
      ),
    };
    customers.set(customer.id, customer);
    if (typeof idem === "string") idempotency.set(idem, customer);
    json(res, 200, customer);
    return;
  }

  if (method === "POST" && path === "/payment_intents") {
    const id = nextId("pi");
    const intent: Intent = {
      id,
      object: "payment_intent",
      amount: Number(form.amount ?? 0),
      currency: form.currency ?? "eur",
      customer: form.customer ?? null,
      client_secret: `${id}_secret_test`,
      status: statusForCreate(),
      metadata: Object.fromEntries(
        Object.entries(form)
          .filter(([k]) => k.startsWith("metadata["))
          .map(([k, v]) => [k.slice(9, -1), v]),
      ),
      last_payment_error: scenario === "decline" ? { message: "Your card was declined.", decline_code: "generic_decline" } : null,
    };
    intents.set(id, intent);
    if (typeof idem === "string") idempotency.set(idem, intent);
    json(res, 200, intent);
    return;
  }

  const retrieve = path.match(/^\/payment_intents\/([^/]+)$/);
  if (method === "GET" && retrieve) {
    const intent = intents.get(retrieve[1]);
    if (!intent) return json(res, 404, { error: { message: "No such payment_intent" } });
    return json(res, 200, intent);
  }

  const update = path.match(/^\/payment_intents\/([^/]+)$/);
  if (method === "POST" && update && !path.endsWith("/confirm") && !path.endsWith("/cancel")) {
    const intent = intents.get(update[1]);
    if (!intent) return json(res, 404, { error: { message: "No such payment_intent" } });
    if (form.amount) intent.amount = Number(form.amount);
    if (form.currency) intent.currency = form.currency;
    if (form.customer) intent.customer = form.customer;
    for (const [k, v] of Object.entries(form)) {
      if (k.startsWith("metadata[")) intent.metadata[k.slice(9, -1)] = v;
    }
    json(res, 200, intent);
    return;
  }

  const confirm = path.match(/^\/payment_intents\/([^/]+)\/confirm$/);
  if (method === "POST" && confirm) {
    const intent = intents.get(confirm[1]);
    if (!intent) return json(res, 404, { error: { message: "No such payment_intent" } });
    intent.status = statusForConfirm();
    if (scenario === "decline") {
      intent.last_payment_error = { message: "Your card was declined.", decline_code: "generic_decline" };
    }
    json(res, 200, intent);
    return;
  }

  const cancel = path.match(/^\/payment_intents\/([^/]+)\/cancel$/);
  if (method === "POST" && cancel) {
    const intent = intents.get(cancel[1]);
    if (!intent) return json(res, 404, { error: { message: "No such payment_intent" } });
    intent.status = "canceled";
    json(res, 200, intent);
    return;
  }

  if (method === "POST" && path === "/refunds") {
    const refund: Refund = {
      id: nextId("re"),
      object: "refund",
      payment_intent: form.payment_intent,
      status: "succeeded",
    };
    refunds.set(refund.id, refund);
    const intent = intents.get(form.payment_intent);
    if (intent) intent.status = "succeeded";
    if (typeof idem === "string") idempotency.set(idem, refund);
    json(res, 200, refund);
    return;
  }

  json(res, 404, { error: { message: `Unhandled ${method} ${path}` } });
}

/** `port` 0 picks a free one (integration tests); Playwright passes a fixed port so the app can be pointed at it. */
export function startFakeStripe(port = 0): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  resetFakeStripe();
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      handle(req, res).catch((error) => {
        json(res, 500, { error: { message: String(error) } });
      });
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No address"));
      const url = `http://127.0.0.1:${address.port}`;
      resolve({
        url,
        port: address.port,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

/** Build a signed Stripe webhook payload the app can verify with STRIPE_WEBHOOK_SECRET. */
export function signWebhook(payload: string, secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_stadium_fake") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;
  // stripe-node HMACs with the raw secret string (including the `whsec_` prefix); it never base64-decodes it.
  const mac = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  return {
    payload,
    header: `t=${timestamp},v1=${mac}`,
  };
}

export function getIntent(id: string) {
  return intents.get(id);
}

export function markIntent(id: string, status: string) {
  const intent = intents.get(id);
  if (intent) intent.status = status;
  return intent;
}
