import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { descriptionFor } from "../src/lib/menu/nutrition";

config();
config({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
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
};

const products: SeedProduct[] = [
  { name: "Cola 0.5L", category: "drinks", priceCents: 350 },
  { name: "Water 0.5L", category: "drinks", priceCents: 250 },
  { name: "Iced Tea 0.5L", category: "drinks", priceCents: 350 },
  { name: "Lager 0.5L", category: "beer", priceCents: 650 },
  { name: "IPA 0.4L", category: "beer", priceCents: 700 },
  { name: "Alcohol-free 0.33L", category: "beer", priceCents: 500 },
  { name: "Fries", category: "snacks", priceCents: 400 },
  { name: "Loaded Fries", category: "snacks", priceCents: 600, description: "Cheese sauce, jalapeños." },
  { name: "Salted Peanuts", category: "snacks", priceCents: 300 },
  { name: "Classic Hot Dog", category: "hot-food", priceCents: 550, description: "Grilled sausage, mustard, ketchup." },
  { name: "Cheeseburger", category: "hot-food", priceCents: 850, description: "Beef patty, cheddar, pickles." },
  { name: "Popcorn (large)", category: "sweets", priceCents: 500 },
  { name: "Soft Serve Cone", category: "sweets", priceCents: 400 },
  { name: "Candy Mix 200g", category: "sweets", priceCents: 450 },
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
