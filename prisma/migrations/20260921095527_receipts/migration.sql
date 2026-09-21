-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_stadiumId_deviceId_paidAt_idx" ON "Receipt"("stadiumId", "deviceId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_stadiumId_orderNumber_key" ON "Receipt"("stadiumId", "orderNumber");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
