-- Products become editable from the kitchen desk: sold out, nutrition, allergens,
-- and option groups (radio or checkbox) that can change the price.

CREATE TYPE "OptionSelection" AS ENUM ('SINGLE', 'MULTIPLE');

ALTER TABLE "Product" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nutrition" JSONB;

CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selection" "OptionSelection" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxSelect" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OptionGroup_productId_sortOrder_idx" ON "OptionGroup"("productId", "sortOrder");

CREATE INDEX "Option_groupId_sortOrder_idx" ON "Option"("groupId", "sortOrder");

ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Option" ADD CONSTRAINT "Option_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move the facts that used to be hard-coded by product name into the rows.
UPDATE "Product" AS p
SET "nutrition" = v.nutrition::jsonb,
    "allergens" = v.allergens::text[],
    "description" = COALESCE(p."description", v.description)
FROM (VALUES
  ('Classic Hot Dog', 'Grilled sausage in a soft bun, with mustard and ketchup.', '{"per":{"amount":1,"unit":"serving"},"kcal":290,"proteinG":11,"carbsG":24,"fatG":16}', '{Gluten,Mustard}'),
  ('Cheeseburger', 'Beef patty, cheddar, pickles and sauce in a toasted bun.', '{"per":{"amount":1,"unit":"serving"},"kcal":540,"proteinG":28,"carbsG":38,"fatG":29}', '{Gluten,Milk}'),
  ('Loaded Fries', 'Fries with warm cheese sauce and jalapeños.', '{"per":{"amount":1,"unit":"serving"},"kcal":480,"proteinG":8,"carbsG":52,"fatG":26}', '{Milk}'),
  ('Fries', 'Salted fries, served hot.', '{"per":{"amount":1,"unit":"serving"},"kcal":320,"proteinG":4,"carbsG":42,"fatG":15}', '{}'),
  ('Cola 0.5L', 'Chilled cola.', '{"per":{"amount":500,"unit":"ml"},"kcal":210,"proteinG":0,"carbsG":53,"fatG":0}', '{}'),
  ('Water 0.5L', 'Still water.', '{"per":{"amount":500,"unit":"ml"},"kcal":0,"proteinG":0,"carbsG":0,"fatG":0}', '{}'),
  ('Lager 0.5L', 'Cold draught lager.', '{"per":{"amount":500,"unit":"ml"},"kcal":215,"proteinG":2,"carbsG":17,"fatG":0}', '{Gluten}'),
  ('IPA 0.4L', 'Hoppy draught IPA.', '{"per":{"amount":400,"unit":"ml"},"kcal":220,"proteinG":2,"carbsG":18,"fatG":0}', '{Gluten}'),
  ('Alcohol-free 0.33L', 'Draught beer without the alcohol.', '{"per":{"amount":330,"unit":"ml"},"kcal":70,"proteinG":1,"carbsG":14,"fatG":0}', '{Gluten}'),
  ('Salted Peanuts', 'Roasted and salted.', '{"per":{"amount":50,"unit":"g"},"kcal":290,"proteinG":12,"carbsG":8,"fatG":25}', '{Peanuts}'),
  ('Popcorn (large)', 'Freshly popped, lightly salted.', '{"per":{"amount":1,"unit":"serving"},"kcal":430,"proteinG":6,"carbsG":48,"fatG":24}', '{}'),
  ('Soft Serve Cone', 'Vanilla soft serve in a wafer cone.', '{"per":{"amount":1,"unit":"serving"},"kcal":180,"proteinG":4,"carbsG":28,"fatG":6}', '{Milk,Gluten}'),
  ('Candy Mix 200g', 'A mix of sweets.', '{"per":{"amount":200,"unit":"g"},"kcal":760,"proteinG":2,"carbsG":180,"fatG":4}', '{}'),
  ('Iced Tea 0.5L', 'Peach iced tea.', '{"per":{"amount":500,"unit":"ml"},"kcal":160,"proteinG":0,"carbsG":40,"fatG":0}', '{}')
) AS v(name, description, nutrition, allergens)
WHERE p."name" = v.name AND p."nutrition" IS NULL;
