import { auth } from "@/lib/auth";
import { withDb } from "@/lib/db";
import { emptySeatMap, type SeatMapDoc } from "@/lib/seatmap/schema";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken, type Receipt } from "@/lib/orders/receipt";

export async function getArena() {
  return withDb((db) => db.stadium.findUniqueOrThrow({ where: { slug: "arena" } }));
}

export async function createKitchenUser(opts?: { email?: string; password?: string; name?: string }) {
  const email = opts?.email ?? `kitchen-${Date.now()}@example.com`;
  const password = opts?.password ?? "password123";
  const name = opts?.name ?? "Kitchen Test";
  const result = await auth.api.signUpEmail({ body: { email, password, name } });
  if (!result?.user) throw new Error("Failed to create kitchen user");
  return { user: result.user, email, password };
}

export async function createProduct(opts?: { name?: string; priceCents?: number; soldOut?: boolean; withOptions?: boolean }) {
  const stadium = await getArena();
  return withDb(async (db) => {
    const category = await db.category.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
    const product = await db.product.create({
      data: {
        stadiumId: stadium.id,
        categoryId: category.id,
        name: opts?.name ?? `Test Product ${Date.now()}`,
        priceCents: opts?.priceCents ?? 500,
        isAvailable: true,
        isSoldOut: opts?.soldOut ?? false,
        sortOrder: 999,
        description: "Factory product",
      },
    });
    if (opts?.withOptions) {
      const group = await db.optionGroup.create({
        data: {
          productId: product.id,
          name: "Size",
          selection: "SINGLE",
          required: true,
          maxSelect: 1,
          sortOrder: 0,
        },
      });
      await db.option.createMany({
        data: [
          { groupId: group.id, name: "Small", priceCents: 0, isDefault: true, sortOrder: 0 },
          { groupId: group.id, name: "Large", priceCents: 100, isDefault: false, sortOrder: 1 },
        ],
      });
    }
    return product;
  });
}

export function makeReceiptFixture(overrides?: Partial<Receipt>): Receipt {
  const orderNumber = overrides?.orderNumber ?? makeOrderNumber();
  return {
    orderNumber,
    stadiumSlug: "arena",
    stadiumName: "Metropolis Arena",
    deviceId: "device-test-001",
    token: makeReceiptToken(),
    confirmCode: makeConfirmCode(),
    seat: { sectionCode: "N", sectionName: "North Stand", row: "1", number: "10" },
    fulfillment: "delivery",
    timing: "asap",
    scheduledAt: null,
    etaMin: 10,
    etaMax: 14,
    currency: "EUR",
    lines: [{ productId: "p1", name: "Cola 0.5L", qty: 1, unitCents: 350, options: [], note: "" }],
    totalCents: 350,
    paidAt: Date.now(),
    readyAt: Date.now() + 12 * 60_000,
    runnerNote: "",
    kitchenStatus: "new",
    ...overrides,
  };
}

export function makeSeatMapDoc(overrides?: Partial<SeatMapDoc>): SeatMapDoc {
  return { ...emptySeatMap(), ...overrides };
}
