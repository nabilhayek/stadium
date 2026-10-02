-- Products belong to the stadium. Copy the stand's stadium onto each product, then drop stands.

ALTER TABLE "Product" ADD COLUMN "stadiumId" TEXT;

UPDATE "Product" AS p
SET "stadiumId" = v."stadiumId"
FROM "Vendor" AS v
WHERE p."vendorId" = v."id";

DELETE FROM "OrderItem"
WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "stadiumId" IS NULL);

DELETE FROM "Product" WHERE "stadiumId" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "stadiumId" SET NOT NULL;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_stadiumId_fkey"
FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Product_vendorId_isAvailable_sortOrder_idx";
CREATE INDEX "Product_stadiumId_isAvailable_sortOrder_idx" ON "Product"("stadiumId", "isAvailable", "sortOrder");

ALTER TABLE "Product" DROP CONSTRAINT "Product_vendorId_fkey";
ALTER TABLE "Product" DROP COLUMN "vendorId";

DROP INDEX "Order_vendorId_status_idx";
ALTER TABLE "Order" DROP CONSTRAINT "Order_vendorId_fkey";
ALTER TABLE "Order" DROP COLUMN "vendorId";

DROP TABLE "Vendor";
