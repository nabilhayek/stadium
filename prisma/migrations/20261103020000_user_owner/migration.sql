-- The first account runs every venue. Until now that was implied by "only the first sign-up is allowed";
-- desk authorization now checks it explicitly.
ALTER TABLE "user" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Existing databases: the oldest account is the one that was created through the first-account sign-up.
UPDATE "user" SET "isOwner" = true
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
