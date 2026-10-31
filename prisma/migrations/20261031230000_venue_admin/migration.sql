-- Desk settings and the team list. One settings document per stadium.

CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

CREATE TABLE "VenueAdmin" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueAdmin_stadiumId_key" ON "VenueAdmin"("stadiumId");

ALTER TABLE "VenueAdmin" ADD CONSTRAINT "VenueAdmin_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissions" JSONB,
    "kitchenIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "StaffStatus" NOT NULL DEFAULT 'INVITED',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffMember_stadiumId_email_key" ON "StaffMember"("stadiumId", "email");
CREATE INDEX "StaffMember_stadiumId_status_idx" ON "StaffMember"("stadiumId", "status");

ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
