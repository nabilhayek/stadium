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
  vendors: [
    {
      id: "v-grill",
      slug: "north-stand-grill",
      name: "North Stand Grill",
      description: "Burgers, hot dogs and fries — fast.",
      products: [
        { id: "p-dog", name: "Classic Hot Dog", description: "Grilled sausage, mustard, ketchup.", imageUrl: null, priceCents: 550, categoryId: "c-hot" },
        { id: "p-burger", name: "Cheeseburger", description: "Beef patty, cheddar, pickles.", imageUrl: null, priceCents: 850, categoryId: "c-hot" },
        { id: "p-loaded", name: "Loaded Fries", description: "Cheese sauce, jalapeños.", imageUrl: null, priceCents: 600, categoryId: "c-snacks" },
        { id: "p-fries", name: "Fries", description: null, imageUrl: null, priceCents: 400, categoryId: "c-snacks" },
        { id: "p-cola", name: "Cola 0.5L", description: null, imageUrl: null, priceCents: 350, categoryId: "c-drinks" },
        { id: "p-water", name: "Water 0.5L", description: null, imageUrl: null, priceCents: 250, categoryId: "c-drinks" },
      ],
    },
    {
      id: "v-tap",
      slug: "tap-house",
      name: "Tap House",
      description: "Cold draught beer, delivered to your seat.",
      products: [
        { id: "p-lager", name: "Lager 0.5L", description: null, imageUrl: null, priceCents: 650, categoryId: "c-beer" },
        { id: "p-ipa", name: "IPA 0.4L", description: null, imageUrl: null, priceCents: 700, categoryId: "c-beer" },
        { id: "p-af", name: "Alcohol-free 0.33L", description: null, imageUrl: null, priceCents: 500, categoryId: "c-beer" },
        { id: "p-nuts", name: "Salted Peanuts", description: null, imageUrl: null, priceCents: 300, categoryId: "c-snacks" },
      ],
    },
    {
      id: "v-sweet",
      slug: "sweet-corner",
      name: "Sweet Corner",
      description: "Ice cream, popcorn and candy.",
      products: [
        { id: "p-pop", name: "Popcorn (large)", description: null, imageUrl: null, priceCents: 500, categoryId: "c-sweets" },
        { id: "p-cone", name: "Soft Serve Cone", description: null, imageUrl: null, priceCents: 400, categoryId: "c-sweets" },
        { id: "p-candy", name: "Candy Mix 200g", description: null, imageUrl: null, priceCents: 450, categoryId: "c-sweets" },
        { id: "p-tea", name: "Iced Tea 0.5L", description: null, imageUrl: null, priceCents: 350, categoryId: "c-drinks" },
      ],
    },
  ],
  categories: [
    { id: "c-drinks", slug: "drinks", name: "Drinks", icon: null },
    { id: "c-beer", slug: "beer", name: "Beer", icon: null },
    { id: "c-snacks", slug: "snacks", name: "Snacks", icon: null },
    { id: "c-hot", slug: "hot-food", name: "Hot food", icon: null },
    { id: "c-sweets", slug: "sweets", name: "Sweets", icon: null },
  ],
};
