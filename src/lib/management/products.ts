import "server-only";
import { revalidatePath } from "next/cache";
import { del, list } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import { toNutrition } from "@/lib/menu/nutrition";
import type { MenuOptionGroup } from "@/lib/menu/options";
import { BLOB_HOST_SUFFIX, type categoriesInput, type productInput } from "./product-input";
import type { z } from "zod";

type ProductData = z.output<typeof productInput>;
type CategoryData = z.output<typeof categoriesInput>;

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  priceCents: true,
  categoryId: true,
  isAvailable: true,
  isSoldOut: true,
  nutrition: true,
  allergens: true,
  sortOrder: true,
  updatedAt: true,
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      selection: true,
      required: true,
      maxSelect: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, priceCents: true, isDefault: true, isSoldOut: true },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function toAdmin(row: ProductRow) {
  return {
    ...row,
    updatedAt: row.updatedAt.getTime(),
    nutrition: toNutrition(row.nutrition),
    allergens: row.allergens ?? [],
    optionGroups: row.optionGroups satisfies MenuOptionGroup[],
  };
}

export type AdminProduct = ReturnType<typeof toAdmin>;
/** `productCount` spans every stadium: categories are shared, so one in use anywhere can't be deleted. */
export type AdminCategory = { id: string; name: string; productCount: number };
export type ProductCatalog = { stadiumName: string; currency: string; products: AdminProduct[]; categories: AdminCategory[] };

async function stadiumId(slug: string) {
  const stadium = await withDb((db) => db.stadium.findUnique({ where: { slug }, select: { id: true } }));
  return stadium?.id ?? null;
}

/** The shop pages are cached for a minute; edits should show up on the next request. */
function refreshShop(slug: string) {
  revalidatePath(`/${slug}`, "layout");
}

function removeImage(url: string | null | undefined) {
  if (!url || !new URL(url).hostname.endsWith(BLOB_HOST_SUFFIX)) return;
  del(url).catch((error) => console.warn("Could not delete product image.", error));
}

/** Every product, disabled ones included, for the kitchen editor. */
export async function listProducts(slug: string): Promise<ProductCatalog | null> {
  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({
      where: { slug },
      select: {
        name: true,
        currency: true,
        products: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: PRODUCT_SELECT },
      },
    });
    if (!stadium) return null;
    return {
      stadiumName: stadium.name,
      currency: stadium.currency,
      products: stadium.products.map(toAdmin),
      categories: await readCategories(db),
    };
  });
}

type Db = Parameters<Parameters<typeof withDb>[0]>[0];

async function readCategories(db: Db): Promise<AdminCategory[]> {
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, _count: { select: { products: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }));
}

function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "category"
  );
}

/**
 * Saves the full category list: renames, new order, new rows, and deletes for rows left out.
 * Categories are shared by every stadium, so every shop is refreshed.
 */
export async function saveCategories(list: CategoryData): Promise<Result<{ categories: AdminCategory[] }>> {
  const outcome = await withDb(async (db) => {
    const existing = await db.category.findMany({
      select: { id: true, slug: true, name: true, _count: { select: { products: true } } },
    });
    const byId = new Map(existing.map((c) => [c.id, c]));
    const kept = new Set(list.filter((c) => c.id && byId.has(c.id)).map((c) => c.id!));
    const removed = existing.filter((c) => !kept.has(c.id));
    const blocked = removed.find((c) => c._count.products > 0);
    if (blocked) {
      const n = blocked._count.products;
      return { error: `${blocked.name} still has ${n} product${n === 1 ? "" : "s"}. Move ${n === 1 ? "it" : "them"} to another category first.` };
    }

    const slugs = new Set(existing.filter((c) => kept.has(c.id)).map((c) => c.slug));
    const freeSlug = (name: string) => {
      const base = slugify(name);
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      slugs.add(slug);
      return slug;
    };

    await db.$transaction(async (tx) => {
      if (removed.length > 0) await tx.category.deleteMany({ where: { id: { in: removed.map((c) => c.id) } } });
      for (const [i, c] of list.entries()) {
        if (c.id && kept.has(c.id)) await tx.category.update({ where: { id: c.id }, data: { name: c.name, sortOrder: i } });
        else await tx.category.create({ data: { name: c.name, slug: freeSlug(c.name), sortOrder: i } });
      }
    }, { timeout: 20_000 });
    return { categories: await readCategories(db) };
  });

  if ("error" in outcome) return { ok: false, error: outcome.error ?? "Couldn’t save the categories." };
  revalidatePath("/", "layout");
  return { ok: true, categories: outcome.categories };
}

/**
 * New order for one category's products. They swap among the sort positions they already hold,
 * so their place relative to other categories doesn't move.
 */
export async function reorderProducts(slug: string, categoryId: string, ids: string[]): Promise<Result> {
  const id = await stadiumId(slug);
  if (!id) return { ok: false, error: "Stadium not found." };
  const done = await withDb(async (db) => {
    const rows = await db.product.findMany({
      where: { stadiumId: id, categoryId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, sortOrder: true },
    });
    const same = rows.length === ids.length && new Set(ids).size === ids.length && rows.every((r) => ids.includes(r.id));
    if (!same) return false;
    const slots = rows.map((r) => r.sortOrder);
    // Duplicate positions (from older data) would make the new order ambiguous; spread them out.
    for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
    await db.$transaction(ids.map((pid, i) => db.product.update({ where: { id: pid }, data: { sortOrder: slots[i] } })));
    return true;
  });
  if (!done) return { ok: false, error: "The list changed while you were sorting. Reload and try again." };
  refreshShop(slug);
  return { ok: true };
}

function groupsCreate(groups: ProductData["optionGroups"]) {
  return groups.map((g, gi) => ({
    name: g.name,
    selection: g.selection,
    required: g.required,
    maxSelect: g.selection === "MULTIPLE" ? g.maxSelect : null,
    sortOrder: gi,
    options: {
      create: g.options.map((o, oi) => ({
        name: o.name,
        priceCents: o.priceCents,
        isDefault: o.isDefault,
        isSoldOut: o.isSoldOut,
        sortOrder: oi,
      })),
    },
  }));
}

function scalars(data: ProductData) {
  return {
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    priceCents: data.priceCents,
    imageUrl: data.imageUrl,
    isAvailable: data.isAvailable,
    isSoldOut: data.isSoldOut,
    nutrition: data.nutrition ?? Prisma.DbNull,
    allergens: data.allergens,
  };
}

export async function createProduct(slug: string, data: ProductData): Promise<Result<{ product: AdminProduct }>> {
  const id = await stadiumId(slug);
  if (!id) return { ok: false, error: "Stadium not found." };
  const row = await withDb(async (db) => {
    const last = await db.product.aggregate({ where: { stadiumId: id }, _max: { sortOrder: true } });
    return db.product.create({
      data: {
        ...scalars(data),
        stadiumId: id,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        optionGroups: { create: groupsCreate(data.optionGroups) },
      },
      select: PRODUCT_SELECT,
    });
  });
  refreshShop(slug);
  return { ok: true, product: toAdmin(row) };
}

/**
 * Groups and options keep their ids when edited, so carts holding them still check out.
 * Ids the product does not own are treated as new rows.
 */
export async function updateProduct(slug: string, productId: string, data: ProductData): Promise<Result<{ product: AdminProduct }>> {
  const id = await stadiumId(slug);
  if (!id) return { ok: false, error: "Stadium not found." };

  const outcome = await withDb(async (db) => {
    const current = await db.product.findFirst({
      where: { id: productId, stadiumId: id },
      select: { imageUrl: true, optionGroups: { select: { id: true, options: { select: { id: true } } } } },
    });
    if (!current) return null;

    const owned = new Map(current.optionGroups.map((g) => [g.id, new Set(g.options.map((o) => o.id))]));
    const keptGroups = data.optionGroups.filter((g) => g.id && owned.has(g.id)).map((g) => g.id!);

    const row = await db.$transaction(async (tx) => {
      await tx.optionGroup.deleteMany({ where: { productId, id: { notIn: keptGroups } } });
      for (const [gi, g] of data.optionGroups.entries()) {
        const groupData = {
          name: g.name,
          selection: g.selection,
          required: g.required,
          maxSelect: g.selection === "MULTIPLE" ? g.maxSelect : null,
          sortOrder: gi,
        };
        const ownedOptions = g.id ? owned.get(g.id) : undefined;
        if (!g.id || !ownedOptions) {
          await tx.optionGroup.create({ data: { ...groupsCreate([g])[0], sortOrder: gi, productId } });
          continue;
        }
        const keptOptions = g.options.filter((o) => o.id && ownedOptions.has(o.id)).map((o) => o.id!);
        await tx.option.deleteMany({ where: { groupId: g.id, id: { notIn: keptOptions } } });
        await tx.optionGroup.update({ where: { id: g.id }, data: groupData });
        for (const [oi, o] of g.options.entries()) {
          const optionData = { name: o.name, priceCents: o.priceCents, isDefault: o.isDefault, isSoldOut: o.isSoldOut, sortOrder: oi };
          if (o.id && ownedOptions.has(o.id)) await tx.option.update({ where: { id: o.id }, data: optionData });
          else await tx.option.create({ data: { ...optionData, groupId: g.id } });
        }
      }
      return tx.product.update({ where: { id: productId }, data: scalars(data), select: PRODUCT_SELECT });
    }, { timeout: 20_000 });
    return { row, oldImage: current.imageUrl };
  });

  if (!outcome) return { ok: false, error: "Product not found." };
  if (outcome.oldImage && outcome.oldImage !== data.imageUrl) removeImage(outcome.oldImage);
  refreshShop(slug);
  return { ok: true, product: toAdmin(outcome.row) };
}

/** The quick toggles on the list: disable, sold out. */
export async function setProductFlags(
  slug: string,
  productId: string,
  flags: { isAvailable?: boolean; isSoldOut?: boolean },
): Promise<Result<{ product: AdminProduct }>> {
  const id = await stadiumId(slug);
  if (!id) return { ok: false, error: "Stadium not found." };
  const row = await withDb(async (db) => {
    const found = await db.product.findFirst({ where: { id: productId, stadiumId: id }, select: { id: true } });
    if (!found) return null;
    return db.product.update({ where: { id: productId }, data: flags, select: PRODUCT_SELECT });
  });
  if (!row) return { ok: false, error: "Product not found." };
  refreshShop(slug);
  return { ok: true, product: toAdmin(row) };
}

export async function deleteProduct(slug: string, productId: string): Promise<Result> {
  const id = await stadiumId(slug);
  if (!id) return { ok: false, error: "Stadium not found." };
  try {
    const removed = await withDb(async (db) => {
      const found = await db.product.findFirst({ where: { id: productId, stadiumId: id }, select: { imageUrl: true } });
      if (!found) return null;
      await db.product.delete({ where: { id: productId } });
      return found;
    });
    if (!removed) return { ok: false, error: "Product not found." };
    removeImage(removed.imageUrl);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, error: "This product is on older orders, so it can’t be deleted. Disable it instead." };
    }
    throw error;
  }
  refreshShop(slug);
  return { ok: true };
}

const imagePrefix = (slug: string) => `products/${slug}/`;

/** Blob URLs under this stadium's product folder, and only those. */
function ownImageUrls(slug: string, urls: string[]) {
  return urls.filter((u) => {
    try {
      const url = new URL(u);
      return url.hostname.endsWith(BLOB_HOST_SUFFIX) && url.pathname.startsWith(`/${imagePrefix(slug)}`);
    } catch {
      return false;
    }
  });
}

/** Deletes photos the editor uploaded but never saved. Photos any product still uses are kept. */
export async function discardImages(slug: string, urls: string[]): Promise<Result> {
  const candidates = ownImageUrls(slug, urls);
  if (candidates.length === 0) return { ok: true };
  const used = await withDb((db) => db.product.findMany({ where: { imageUrl: { in: candidates } }, select: { imageUrl: true } }));
  const keep = new Set(used.map((p) => p.imageUrl));
  const orphans = candidates.filter((u) => !keep.has(u));
  if (orphans.length > 0) await del(orphans);
  return { ok: true };
}

/** Uploads older than this with no product pointing at them were abandoned (closed tab, crash). */
const ORPHAN_AGE_MS = 24 * 60 * 60_000;
const lastSweep = new Map<string, number>();

async function sweepOrphanImages(slug: string) {
  const now = Date.now();
  if (now - (lastSweep.get(slug) ?? 0) < 60 * 60_000) return;
  lastSweep.set(slug, now);
  const { blobs } = await list({ prefix: imagePrefix(slug), limit: 1000 });
  const stale = blobs.filter((b) => now - b.uploadedAt.getTime() > ORPHAN_AGE_MS).map((b) => b.url);
  if (stale.length > 0) await discardImages(slug, stale);
}

/** A short-lived token that lets the browser upload one image straight to Blob storage. */
export async function imageUploadToken(slug: string, filename: string, contentType: string): Promise<Result<{ token: string; pathname: string }>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "Image uploads aren’t set up on this server." };
  if (!IMAGE_TYPES.includes(contentType)) return { ok: false, error: "Use a JPG, PNG, WebP or AVIF image." };
  sweepOrphanImages(slug).catch((error) => console.warn("Could not sweep unused product images.", error));
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const base = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "product";
  const pathname = `${imagePrefix(slug)}${base}.${ext}`;
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: IMAGE_TYPES,
    maximumSizeInBytes: MAX_IMAGE_BYTES,
    addRandomSuffix: true,
    validUntil: Date.now() + 5 * 60_000,
  });
  return { ok: true, token, pathname };
}
