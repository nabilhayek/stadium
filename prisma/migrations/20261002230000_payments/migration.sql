-- Stripe charges. The receipt is created only after a PaymentIntent succeeds.

CREATE TYPE "PaymentState" AS ENUM ('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED');

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "state" "PaymentState" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "stripeStatus" TEXT NOT NULL,
    "declineCode" TEXT,
    "stripeCustomerId" TEXT,
    "draft" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_paymentIntentId_key" ON "Payment"("paymentIntentId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_stadiumId_orderNumber_idx" ON "Payment"("stadiumId", "orderNumber");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
