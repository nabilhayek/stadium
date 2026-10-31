import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "./receipt";

const mutate = vi.fn();
const query = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    orders: {
      put: { mutate },
      get: { query },
      history: { query: vi.fn() },
    },
  },
  httpStatus: (error: unknown) => (error as { status?: number })?.status ?? null,
}));

vi.mock("@/lib/device", () => ({
  getDeviceId: () => "device-12345678",
}));

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    orderNumber: "A-SYNC",
    stadiumSlug: "arena",
    stadiumName: "Arena",
    seat: null,
    fulfillment: "delivery",
    timing: "asap",
    scheduledAt: null,
    etaMin: 10,
    etaMax: 15,
    paidAt: 1,
    readyAt: 2,
    runnerNote: "",
    confirmCode: "1234",
    token: "write-token",
    lines: [{ productId: "p", name: "Item", qty: 1 }],
    ...overrides,
  };
}

describe("flushOrderSync", () => {
  let storage = new Map<string, string>();

  beforeEach(async () => {
    vi.resetModules();
    storage = new Map();
    mutate.mockReset();
    query.mockReset();
    const store = storage;
    const storageApi = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    vi.stubGlobal("window", {
      localStorage: storageApi,
      sessionStorage: storageApi,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes queued receipts via trpc and clears queue on success", async () => {
    mutate.mockResolvedValue(undefined);
    const { commitReceipt, flushOrderSync } = await import("./sync");
    const { pastOrdersKey } = await import("./past");

    commitReceipt(receipt());
    expect(JSON.parse(storage.get("order-sync:v1")!)).toEqual(["arena|A-SYNC"]);

    await flushOrderSync();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].orderNumber).toBe("A-SYNC");
    expect(storage.get("order-sync:v1")).toBeUndefined();
    expect(JSON.parse(storage.get(pastOrdersKey("arena"))!)).toHaveLength(1);
  });

  it("stops on offline errors and retries later", async () => {
    mutate.mockRejectedValue({ status: 503 });
    const { commitReceipt, flushOrderSync } = await import("./sync");

    commitReceipt(receipt());
    expect(storage.get("order-sync:v1")).toBeTruthy();

    await flushOrderSync();
    expect(mutate).toHaveBeenCalledTimes(1);
    const queued = storage.get("order-sync:v1");
    expect(queued).toBeTruthy();
    expect(JSON.parse(queued!)).toEqual(["arena|A-SYNC"]);
  });

  it("drops queue entry on 4xx", async () => {
    mutate.mockRejectedValue({ status: 400 });
    const { commitReceipt, flushOrderSync } = await import("./sync");

    commitReceipt(receipt());

    await flushOrderSync();
    expect(storage.get("order-sync:v1")).toBeUndefined();
  });
});

describe("fetchReceipt", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("returns found, missing, and offline", async () => {
    const { fetchReceipt } = await import("./sync");
    query.mockResolvedValueOnce(receipt());
    expect(await fetchReceipt("arena", "A-SYNC")).toEqual({ status: "found", receipt: expect.objectContaining({ orderNumber: "A-SYNC" }) });

    query.mockResolvedValueOnce(null);
    expect(await fetchReceipt("arena", "A-NOPE")).toEqual({ status: "missing" });

    query.mockRejectedValueOnce({ status: 503 });
    expect(await fetchReceipt("arena", "A-SYNC")).toEqual({ status: "offline" });

    query.mockRejectedValueOnce({ status: 400 });
    expect(await fetchReceipt("arena", "A-SYNC")).toEqual({ status: "missing" });
  });
});
