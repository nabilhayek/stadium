import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { descriptionFor, type Allergen, type Nutrition, type NutritionUnit } from "../src/lib/menu/nutrition";
import { postgresConnectionString } from "../src/lib/pg-url";

config();
config({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: postgresConnectionString(
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    ),
  }),
});

const categories = [
  { slug: "drinks", name: "Drinks", icon: null as string | null, sortOrder: 0 },
  { slug: "beer", name: "Beer", icon: null as string | null, sortOrder: 1 },
  { slug: "snacks", name: "Snacks", icon: null as string | null, sortOrder: 2 },
  { slug: "hot-food", name: "Hot food", icon: null as string | null, sortOrder: 3 },
  { slug: "sweets", name: "Sweets", icon: null as string | null, sortOrder: 4 },
];

type SeedProduct = {
  name: string;
  category: string;
  priceCents: number;
  description?: string;
  nutrition: Nutrition;
  allergens: Allergen[];
};

/** kcal, protein, carbs, fat — per serving or per `amount` of `unit`. */
function per(amount: number, unit: NutritionUnit, kcal: number, proteinG: number, carbsG: number, fatG: number): Nutrition {
  return { per: { amount, unit }, kcal, proteinG, carbsG, fatG };
}
const serving = (kcal: number, proteinG: number, carbsG: number, fatG: number) => per(1, "serving", kcal, proteinG, carbsG, fatG);

const products: SeedProduct[] = [
  { name: "Cola 0.5L", category: "drinks", priceCents: 350, nutrition: per(500, "ml", 210, 0, 53, 0), allergens: [] },
  { name: "Water 0.5L", category: "drinks", priceCents: 250, nutrition: per(500, "ml", 0, 0, 0, 0), allergens: [] },
  { name: "Iced Tea 0.5L", category: "drinks", priceCents: 350, nutrition: per(500, "ml", 160, 0, 40, 0), allergens: [] },
  { name: "Lager 0.5L", category: "beer", priceCents: 650, nutrition: per(500, "ml", 215, 2, 17, 0), allergens: ["Gluten"] },
  { name: "IPA 0.4L", category: "beer", priceCents: 700, nutrition: per(400, "ml", 220, 2, 18, 0), allergens: ["Gluten"] },
  { name: "Alcohol-free 0.33L", category: "beer", priceCents: 500, nutrition: per(330, "ml", 70, 1, 14, 0), allergens: ["Gluten"] },
  { name: "Fries", category: "snacks", priceCents: 400, nutrition: serving(320, 4, 42, 15), allergens: [] },
  {
    name: "Loaded Fries",
    category: "snacks",
    priceCents: 600,
    description: "Cheese sauce, jalapeños.",
    nutrition: serving(480, 8, 52, 26),
    allergens: ["Milk"],
  },
  { name: "Salted Peanuts", category: "snacks", priceCents: 300, nutrition: per(50, "g", 290, 12, 8, 25), allergens: ["Peanuts"] },
  {
    name: "Classic Hot Dog",
    category: "hot-food",
    priceCents: 550,
    description: "Grilled sausage, mustard, ketchup.",
    nutrition: serving(290, 11, 24, 16),
    allergens: ["Gluten", "Mustard"],
  },
  {
    name: "Cheeseburger",
    category: "hot-food",
    priceCents: 850,
    description: "Beef patty, cheddar, pickles.",
    nutrition: serving(540, 28, 38, 29),
    allergens: ["Gluten", "Milk"],
  },
  { name: "Popcorn (large)", category: "sweets", priceCents: 500, nutrition: serving(430, 6, 48, 24), allergens: [] },
  { name: "Soft Serve Cone", category: "sweets", priceCents: 400, nutrition: serving(180, 4, 28, 6), allergens: ["Milk", "Gluten"] },
  { name: "Candy Mix 200g", category: "sweets", priceCents: 450, nutrition: per(200, "g", 760, 2, 180, 4), allergens: [] },
];

async function main() {
  const stadium = await prisma.stadium.upsert({
    where: { slug: "arena" },
    update: {},
    create: {
      slug: "arena",
      name: "Metropolis Arena",
      city: "Amsterdam",
      currency: "EUR",
      sections: {
        create: ["N", "E", "S", "W"].map((code, i) => ({
          code,
          name: `${{ N: "North", E: "East", S: "South", W: "West" }[code]} Stand`,
          sortOrder: i,
        })),
      },
    },
  });

  const sectionDefs = [
    { code: "N", name: "North Stand" },
    { code: "E", name: "East Stand" },
    { code: "S", name: "South Stand" },
    { code: "W", name: "West Stand" },
    { code: "G", name: "Section G" },
  ];
  for (const [i, s] of sectionDefs.entries()) {
    await prisma.section.upsert({
      where: { stadiumId_code: { stadiumId: stadium.id, code: s.code } },
      update: { name: s.name, sortOrder: i },
      create: { stadiumId: stadium.id, code: s.code, name: s.name, sortOrder: i },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, sortOrder: c.sortOrder },
      create: c,
    });
    categoryIds.set(c.slug, row.id);
  }

  const existing = await prisma.product.findMany({
    where: { stadiumId: stadium.id },
    select: { id: true, name: true },
  });
  const byName = new Map<string, string[]>();
  for (const row of existing) {
    const ids = byName.get(row.name) ?? [];
    ids.push(row.id);
    byName.set(row.name, ids);
  }

  for (const [pi, p] of products.entries()) {
    const data = {
      stadiumId: stadium.id,
      categoryId: categoryIds.get(p.category)!,
      name: p.name,
      description: p.description ?? descriptionFor(p.name),
      priceCents: p.priceCents,
      nutrition: p.nutrition,
      allergens: p.allergens,
      sortOrder: pi,
    };
    const ids = byName.get(p.name) ?? [];
    const [keep, ...dupes] = ids;
    if (keep) {
      await prisma.product.update({ where: { id: keep }, data });
      if (dupes.length > 0) {
        await prisma.product.updateMany({ where: { id: { in: dupes } }, data: { isAvailable: false } });
      }
    } else {
      await prisma.product.create({ data });
    }
  }

  console.log(`Seeded stadium "${stadium.name}" → /${stadium.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
