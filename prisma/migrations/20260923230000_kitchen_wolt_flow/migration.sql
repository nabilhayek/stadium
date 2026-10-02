-- Kitchen flow now mirrors a merchant app: New -> In progress (ACCEPTED) -> Ready -> Done,
-- with DECLINED as the exit for rejected orders. PREPARING folds into ACCEPTED.

UPDATE "Receipt" SET "kitchenStatus" = 'ACCEPTED' WHERE "kitchenStatus" = 'PREPARING';

ALTER TYPE "KitchenStatus" RENAME TO "KitchenStatus_old";
CREATE TYPE "KitchenStatus" AS ENUM ('NEW', 'ACCEPTED', 'READY', 'DONE', 'DECLINED');

ALTER TABLE "Receipt" ALTER COLUMN "kitchenStatus" DROP DEFAULT;
ALTER TABLE "Receipt"
  ALTER COLUMN "kitchenStatus" TYPE "KitchenStatus"
  USING ("kitchenStatus"::text::"KitchenStatus");
ALTER TABLE "Receipt" ALTER COLUMN "kitchenStatus" SET DEFAULT 'NEW';

DROP TYPE "KitchenStatus_old";
