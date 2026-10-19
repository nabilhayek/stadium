import type { AdminProduct } from "@/lib/management/products";
import { productInput, type ProductInput } from "@/lib/management/product-input";
import type { NutritionUnit } from "@/lib/menu/nutrition";
import type { OptionSelection } from "@/lib/menu/options";
import { centsToInput, parseCents } from "@/lib/money";

/** The editor works on strings so half-typed prices stay as typed. `key` is React's; `id` is the database's. */
export type OptionDraft = { key: string; id?: string; name: string; price: string; isDefault: boolean; isSoldOut: boolean };

export type GroupDraft = {
  key: string;
  id?: string;
  name: string;
  selection: OptionSelection;
  required: boolean;
  maxSelect: string;
  options: OptionDraft[];
};

export type NutritionDraft = {
  amount: string;
  unit: NutritionUnit;
  kcal: string;
  fatG: string;
  carbsG: string;
  sugarG: string;
  proteinG: string;
  saltG: string;
};

export type ProductDraft = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  imageUrl: string | null;
  isAvailable: boolean;
  isSoldOut: boolean;
  hasNutrition: boolean;
  nutrition: NutritionDraft;
  allergens: string[];
  groups: GroupDraft[];
};

export type DraftErrors = Record<string, string>;

const key = () => crypto.randomUUID();

const EMPTY_NUTRITION: NutritionDraft = {
  amount: "100",
  unit: "g",
  kcal: "",
  fatG: "",
  carbsG: "",
  sugarG: "",
  proteinG: "",
  saltG: "",
};

export function newOption(name = ""): OptionDraft {
  return { key: key(), name, price: "", isDefault: false, isSoldOut: false };
}

export function newGroup(selection: OptionSelection): GroupDraft {
  return {
    key: key(),
    name: "",
    selection,
    required: selection === "SINGLE",
    maxSelect: "",
    options: [newOption(), newOption()],
  };
}

function num(n: number | undefined) {
  return n === undefined ? "" : String(n);
}

/** `copy` drops ids so saving creates new rows. */
export function draftFrom(product: AdminProduct | null, fallbackCategory: string, copy = false): ProductDraft {
  if (!product) {
    return {
      name: "",
      description: "",
      categoryId: fallbackCategory,
      price: "",
      imageUrl: null,
      isAvailable: true,
      isSoldOut: false,
      hasNutrition: false,
      nutrition: EMPTY_NUTRITION,
      allergens: [],
      groups: [],
    };
  }
  const n = product.nutrition;
  return {
    name: copy ? `${product.name} (copy)` : product.name,
    description: product.description ?? "",
    categoryId: product.categoryId,
    price: centsToInput(product.priceCents),
    imageUrl: copy ? null : product.imageUrl,
    isAvailable: copy ? false : product.isAvailable,
    isSoldOut: product.isSoldOut,
    hasNutrition: n !== null,
    nutrition: n
      ? {
          amount: String(n.per.amount),
          unit: n.per.unit,
          kcal: String(n.kcal),
          fatG: String(n.fatG),
          carbsG: String(n.carbsG),
          sugarG: num(n.sugarG),
          proteinG: String(n.proteinG),
          saltG: num(n.saltG),
        }
      : EMPTY_NUTRITION,
    allergens: product.allergens,
    groups: product.optionGroups.map((g) => ({
      key: key(),
      id: copy ? undefined : g.id,
      name: g.name,
      selection: g.selection,
      required: g.required,
      maxSelect: g.maxSelect === null ? "" : String(g.maxSelect),
      options: g.options.map((o) => ({
        key: key(),
        id: copy ? undefined : o.id,
        name: o.name,
        price: o.priceCents === 0 ? "" : centsToInput(o.priceCents),
        isDefault: o.isDefault,
        isSoldOut: o.isSoldOut,
      })),
    })),
  };
}

function decimal(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const NUMERIC_MESSAGES: Record<string, string> = {
  invalid_type: "Enter a number.",
  too_small: "Too low.",
  too_big: "Too high.",
};

/** Validates with the same schema the server uses. Error keys are dotted paths, e.g. `optionGroups.0.options.1.name`. */
export function toInput(draft: ProductDraft): { input: ProductInput; errors: null } | { input: null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const priceCents = parseCents(draft.price);
  if (priceCents === null) errors.priceCents = "Enter a price, like 4.50.";

  const optionGroups = draft.groups.map((g, gi) => ({
    ...(g.id ? { id: g.id } : {}),
    name: g.name,
    selection: g.selection,
    required: g.required,
    maxSelect: g.selection === "MULTIPLE" && g.maxSelect.trim() ? Number(g.maxSelect) : null,
    options: g.options.map((o, oi) => {
      const cents = o.price.replace(/^[+-]/, "").trim() ? parseCents(o.price) : 0;
      if (cents === null) errors[`optionGroups.${gi}.options.${oi}.priceCents`] = "Not a price.";
      return {
        ...(o.id ? { id: o.id } : {}),
        name: o.name,
        priceCents: cents ?? 0,
        isDefault: o.isDefault,
        isSoldOut: o.isSoldOut,
      };
    }),
  }));

  const n = draft.nutrition;
  const input = {
    name: draft.name,
    description: draft.description,
    categoryId: draft.categoryId,
    priceCents: priceCents ?? 0,
    imageUrl: draft.imageUrl,
    isAvailable: draft.isAvailable,
    isSoldOut: draft.isSoldOut,
    nutrition: draft.hasNutrition
      ? {
          per: { amount: decimal(n.amount) as number, unit: n.unit },
          kcal: decimal(n.kcal) as number,
          fatG: decimal(n.fatG) as number,
          carbsG: decimal(n.carbsG) as number,
          proteinG: decimal(n.proteinG) as number,
          ...(n.sugarG.trim() ? { sugarG: decimal(n.sugarG) } : {}),
          ...(n.saltG.trim() ? { saltG: decimal(n.saltG) } : {}),
        }
      : null,
    allergens: draft.allergens,
    optionGroups,
  } as ProductInput;

  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (errors[path]) continue;
      const numeric = /nutrition|priceCents|maxSelect/.test(path);
      errors[path] = numeric ? (NUMERIC_MESSAGES[issue.code] ?? issue.message) : issue.message;
    }
  }
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input, errors: null };
}
