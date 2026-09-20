import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

type SeedVendor = {
  slug: string;
  name: string;
  description: string;
  products: SeedProduct[];
};

const vendors: SeedVendor[] = [
  {
    slug: "north-stand-grill",
    name: "North Stand Grill",
    description: "Burgers, hot dogs and fries — fast.",
    products: [
      { name: "Classic Hot Dog", category: "hot-food", priceCents: 550, description: "Grilled sausage, mustard, ketchup." },
      { name: "Cheeseburger", category: "hot-food", priceCents: 850, description: "Beef patty, cheddar, pickles." },
      { name: "Loaded Fries", category: "snacks", priceCents: 600, description: "Cheese sauce, jalapeños." },
      { name: "Fries", category: "snacks", priceCents: 400 },
      { name: "Cola 0.5L", category: "drinks", priceCents: 350 },
      { name: "Water 0.5L", category: "drinks", priceCents: 250 },
    ],
  },
  {
    slug: "tap-house",
    name: "Tap House",
    description: "Cold draught beer, delivered to your seat.",
    products: [
      { name: "Lager 0.5L", category: "beer", priceCents: 650 },
      { name: "IPA 0.4L", category: "beer", priceCents: 700 },
      { name: "Alcohol-free 0.33L", category: "beer", priceCents: 500 },
      { name: "Salted Peanuts", category: "snacks", priceCents: 300 },
    ],
  },
  {
    slug: "sweet-corner",
    name: "Sweet Corner",
    description: "Ice cream, popcorn and candy.",
    products: [
      { name: "Popcorn (large)", category: "sweets", priceCents: 500 },
      { name: "Soft Serve Cone", category: "sweets", priceCents: 400 },
      { name: "Candy Mix 200g", category: "sweets", priceCents: 450 },
      { name: "Iced Tea 0.5L", category: "drinks", priceCents: 350 },
    ],
  },
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

  for (const [vi, v] of vendors.entries()) {
    const vendor = await prisma.vendor.upsert({
      where: { stadiumId_slug: { stadiumId: stadium.id, slug: v.slug } },
      update: { name: v.name, description: v.description, sortOrder: vi },
      create: {
        stadiumId: stadium.id,
        slug: v.slug,
        name: v.name,
        description: v.description,
        sortOrder: vi,
      },
    });

    // Products have no natural unique key; reset per vendor to keep the seed idempotent.
    await prisma.product.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.product.createMany({
      data: v.products.map((p, pi) => ({
        vendorId: vendor.id,
        categoryId: categoryIds.get(p.category)!,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        sortOrder: pi,
      })),
    });
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
