import { z } from "zod";
import { ALLERGENS, NUTRITION_UNITS } from "@/lib/menu/nutrition";

/** Fits two lines on the shop's product card. */
export const DESCRIPTION_MAX = 92;
export const NAME_MAX = 60;
export const MAX_GROUPS = 12;
export const MAX_OPTIONS = 30;
/** €1,000. Anything above is a typo. */
const PRICE_MAX = 100_000;

export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

const name = z.string().trim().min(1, "Give it a name.").max(NAME_MAX, `Keep it under ${NAME_MAX} characters.`);
const grams = z.number().min(0).max(10_000);

export const nutritionInput = z.object({
  per: z.object({ amount: z.number().positive().max(10_000), unit: z.enum(NUTRITION_UNITS) }),
  kcal: z.number().int().min(0).max(10_000),
  fatG: grams,
  carbsG: grams,
  sugarG: grams.optional(),
  proteinG: grams,
  saltG: grams.optional(),
});

export const optionInput = z.object({
  /** Present when editing an option that already exists. */
  id: z.string().optional(),
  name,
  priceCents: z.number().int().min(-PRICE_MAX).max(PRICE_MAX),
  isDefault: z.boolean(),
  isSoldOut: z.boolean(),
});

export const optionGroupInput = z
  .object({
    id: z.string().optional(),
    name,
    selection: z.enum(["SINGLE", "MULTIPLE"]),
    required: z.boolean(),
    maxSelect: z.number().int().min(1).max(MAX_OPTIONS).nullable(),
    options: z.array(optionInput).min(1, "Add at least one option.").max(MAX_OPTIONS),
  })
  .superRefine((group, ctx) => {
    const defaults = group.options.filter((o) => o.isDefault).length;
    if (group.selection === "SINGLE" && defaults > 1) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Only one option can be pre-selected." });
    }
    if (group.selection === "MULTIPLE" && group.maxSelect !== null) {
      if (group.maxSelect > group.options.length) {
        ctx.addIssue({ code: "custom", path: ["maxSelect"], message: "The limit is higher than the number of options." });
      }
      if (defaults > group.maxSelect) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "More options are pre-selected than the limit allows." });
      }
    }
    if (group.required && group.options.every((o) => o.isSoldOut)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Every option is sold out, so nobody can order this." });
    }
  });

export const productInput = z.object({
  name,
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Keep it under ${DESCRIPTION_MAX} characters.`)
    .transform((s) => s || null)
    .nullable(),
  categoryId: z.string().min(1, "Pick a category."),
  priceCents: z.number().int().min(0).max(PRICE_MAX),
  imageUrl: z
    .url()
    .refine((u) => new URL(u).hostname.endsWith(BLOB_HOST_SUFFIX), "Upload the image instead of linking it.")
    .nullable(),
  isAvailable: z.boolean(),
  isSoldOut: z.boolean(),
  nutrition: nutritionInput.nullable(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  optionGroups: z.array(optionGroupInput).max(MAX_GROUPS),
});

export const CATEGORY_NAME_MAX = 32;
export const MAX_CATEGORIES = 30;

/** The whole category list in its new order. Existing rows keep their id; rows left out are deleted. */
export const categoriesInput = z
  .array(
    z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1, "Give it a name.").max(CATEGORY_NAME_MAX, `Keep it under ${CATEGORY_NAME_MAX} characters.`),
    }),
  )
  .min(1, "Keep at least one category.")
  .max(MAX_CATEGORIES)
  .superRefine((list, ctx) => {
    const seen = new Map<string, number>();
    list.forEach((c, i) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "name"], message: "Another category has this name." });
      else seen.set(key, i);
    });
  });

export type CategoryInput = z.input<typeof categoriesInput>[number];
export type ProductInput = z.input<typeof productInput>;
export type OptionGroupInput = z.input<typeof optionGroupInput>;
export type OptionInput = z.input<typeof optionInput>;
