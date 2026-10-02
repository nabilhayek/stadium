import { descriptionFor } from "@/lib/menu/nutrition";

function item(id: string, name: string, priceCents: number, categoryId: string) {
  return {
    id,
    name,
    description: descriptionFor(name),
    imageUrl: null as null,
    priceCents,
    categoryId,
  };
}

/** Used when the local Postgres pool is down so the shop/checkout still render in dev. */
export const FALLBACK_ARENA = {
  id: "fallback-arena",
  slug: "arena",
  name: "Metropolis Arena",
  city: "Amsterdam",
  currency: "EUR",
  sections: [
    { id: "N", code: "N", name: "North Stand" },
    { id: "E", code: "E", name: "East Stand" },
    { id: "S", code: "S", name: "South Stand" },
    { id: "W", code: "W", name: "West Stand" },
    { id: "G", code: "G", name: "Section G" },
  ],
  products: [
    item("p-cola", "Cola 0.5L", 350, "c-drinks"),
    item("p-water", "Water 0.5L", 250, "c-drinks"),
    item("p-tea", "Iced Tea 0.5L", 350, "c-drinks"),
    item("p-lager", "Lager 0.5L", 650, "c-beer"),
    item("p-ipa", "IPA 0.4L", 700, "c-beer"),
    item("p-af", "Alcohol-free 0.33L", 500, "c-beer"),
    item("p-fries", "Fries", 400, "c-snacks"),
    item("p-loaded", "Loaded Fries", 600, "c-snacks"),
    item("p-nuts", "Salted Peanuts", 300, "c-snacks"),
    item("p-dog", "Classic Hot Dog", 550, "c-hot"),
    item("p-burger", "Cheeseburger", 850, "c-hot"),
    item("p-pop", "Popcorn (large)", 500, "c-sweets"),
    item("p-cone", "Soft Serve Cone", 400, "c-sweets"),
    item("p-candy", "Candy Mix 200g", 450, "c-sweets"),
  ],
  categories: [
    { id: "c-drinks", slug: "drinks", name: "Drinks", icon: null },
    { id: "c-beer", slug: "beer", name: "Beer", icon: null },
    { id: "c-snacks", slug: "snacks", name: "Snacks", icon: null },
    { id: "c-hot", slug: "hot-food", name: "Hot food", icon: null },
    { id: "c-sweets", slug: "sweets", name: "Sweets", icon: null },
  ],
};
