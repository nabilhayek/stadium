/** Facts shown on the product page. Stored on `Product.nutrition`; every number is per `per`. */
export type Nutrition = {
  per: { amount: number; unit: NutritionUnit };
  kcal: number;
  fatG: number;
  carbsG: number;
  sugarG?: number;
  proteinG: number;
  saltG?: number;
};

export const NUTRITION_UNITS = ["g", "ml", "serving"] as const;
export type NutritionUnit = (typeof NUTRITION_UNITS)[number];

/** The 14 allergens EU food law requires venues to declare. */
export const ALLERGENS = [
  "Gluten",
  "Crustaceans",
  "Eggs",
  "Fish",
  "Peanuts",
  "Soy",
  "Milk",
  "Nuts",
  "Celery",
  "Mustard",
  "Sesame",
  "Sulphites",
  "Lupin",
  "Molluscs",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

function amount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Strict read of the JSON column. Anything malformed shows no nutrition rather than wrong numbers. */
export function toNutrition(value: unknown): Nutrition | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const per = o.per as Record<string, unknown> | undefined;
  const perAmount = amount(per?.amount);
  const unit = per?.unit as NutritionUnit;
  if (!perAmount || !NUTRITION_UNITS.includes(unit)) return null;
  const kcal = amount(o.kcal);
  const fatG = amount(o.fatG);
  const carbsG = amount(o.carbsG);
  const proteinG = amount(o.proteinG);
  if (kcal === null || fatG === null || carbsG === null || proteinG === null) return null;
  const out: Nutrition = { per: { amount: perAmount, unit }, kcal, fatG, carbsG, proteinG };
  const sugarG = amount(o.sugarG);
  if (sugarG !== null) out.sugarG = sugarG;
  const saltG = amount(o.saltG);
  if (saltG !== null) out.saltG = saltG;
  return out;
}

/** "100 g", "500 ml", "serving". */
export function formatPer(per: Nutrition["per"]) {
  if (per.unit === "serving") return per.amount === 1 ? "serving" : `${per.amount} servings`;
  return `${per.amount} ${per.unit}`;
}

/** Seed and offline-menu copy. The live menu reads descriptions from the database. */
const DESCRIPTIONS: Record<string, string> = {
  "Classic Hot Dog": "Grilled sausage in a soft bun, with mustard and ketchup.",
  Cheeseburger: "Beef patty, cheddar, pickles and sauce in a toasted bun.",
  "Loaded Fries": "Fries with warm cheese sauce and jalapeños.",
  Fries: "Salted fries, served hot.",
  "Cola 0.5L": "Chilled cola.",
  "Water 0.5L": "Still water.",
  "Lager 0.5L": "Cold draught lager.",
  "IPA 0.4L": "Hoppy draught IPA.",
  "Alcohol-free 0.33L": "Draught beer without the alcohol.",
  "Salted Peanuts": "Roasted and salted.",
  "Popcorn (large)": "Freshly popped, lightly salted.",
  "Soft Serve Cone": "Vanilla soft serve in a wafer cone.",
  "Candy Mix 200g": "A mix of sweets.",
  "Iced Tea 0.5L": "Peach iced tea.",
};

export function descriptionFor(name: string): string | null {
  return DESCRIPTIONS[name] ?? null;
}
