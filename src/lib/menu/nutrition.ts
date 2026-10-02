/** Per-serving facts shown on the product page. */
export type Nutrition = {
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  allergens: string[];
};

const BY_NAME: Record<string, { description: string; nutrition: Nutrition }> = {
  "Classic Hot Dog": {
    description: "Grilled sausage in a soft bun, with mustard and ketchup.",
    nutrition: { serving: "1 hot dog", calories: 290, proteinG: 11, carbsG: 24, fatG: 16, allergens: ["Gluten", "Mustard"] },
  },
  Cheeseburger: {
    description: "Beef patty, cheddar, pickles and sauce in a toasted bun.",
    nutrition: { serving: "1 burger", calories: 540, proteinG: 28, carbsG: 38, fatG: 29, allergens: ["Gluten", "Milk"] },
  },
  "Loaded Fries": {
    description: "Fries with warm cheese sauce and jalapeños.",
    nutrition: { serving: "1 tray", calories: 480, proteinG: 8, carbsG: 52, fatG: 26, allergens: ["Milk"] },
  },
  Fries: {
    description: "Salted fries, served hot.",
    nutrition: { serving: "1 tray", calories: 320, proteinG: 4, carbsG: 42, fatG: 15, allergens: [] },
  },
  "Cola 0.5L": {
    description: "Chilled cola.",
    nutrition: { serving: "500 ml", calories: 210, proteinG: 0, carbsG: 53, fatG: 0, allergens: [] },
  },
  "Water 0.5L": {
    description: "Still water.",
    nutrition: { serving: "500 ml", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, allergens: [] },
  },
  "Lager 0.5L": {
    description: "Cold draught lager.",
    nutrition: { serving: "500 ml", calories: 215, proteinG: 2, carbsG: 17, fatG: 0, allergens: ["Gluten"] },
  },
  "IPA 0.4L": {
    description: "Hoppy draught IPA.",
    nutrition: { serving: "400 ml", calories: 220, proteinG: 2, carbsG: 18, fatG: 0, allergens: ["Gluten"] },
  },
  "Alcohol-free 0.33L": {
    description: "Draught beer without the alcohol.",
    nutrition: { serving: "330 ml", calories: 70, proteinG: 1, carbsG: 14, fatG: 0, allergens: ["Gluten"] },
  },
  "Salted Peanuts": {
    description: "Roasted and salted.",
    nutrition: { serving: "50 g", calories: 290, proteinG: 12, carbsG: 8, fatG: 25, allergens: ["Peanuts"] },
  },
  "Popcorn (large)": {
    description: "Freshly popped, lightly salted.",
    nutrition: { serving: "1 large tub", calories: 430, proteinG: 6, carbsG: 48, fatG: 24, allergens: [] },
  },
  "Soft Serve Cone": {
    description: "Vanilla soft serve in a wafer cone.",
    nutrition: { serving: "1 cone", calories: 180, proteinG: 4, carbsG: 28, fatG: 6, allergens: ["Milk", "Gluten"] },
  },
  "Candy Mix 200g": {
    description: "A mix of sweets.",
    nutrition: { serving: "200 g", calories: 760, proteinG: 2, carbsG: 180, fatG: 4, allergens: [] },
  },
  "Iced Tea 0.5L": {
    description: "Peach iced tea.",
    nutrition: { serving: "500 ml", calories: 160, proteinG: 0, carbsG: 40, fatG: 0, allergens: [] },
  },
};

export function descriptionFor(name: string): string | null {
  return BY_NAME[name]?.description ?? null;
}

export function nutritionFor(name: string): Nutrition | null {
  return BY_NAME[name]?.nutrition ?? null;
}
