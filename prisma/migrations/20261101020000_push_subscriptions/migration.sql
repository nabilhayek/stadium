-- Browsers that asked for notifications. A fan row follows one order, a desk row one signed-in user.

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "orderNumber" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PushSubscription_one_owner" CHECK (("orderNumber" IS NULL) <> ("userId" IS NULL))
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_stadiumId_orderNumber_idx" ON "PushSubscription"("stadiumId", "orderNumber");
CREATE INDEX "PushSubscription_stadiumId_userId_idx" ON "PushSubscription"("stadiumId", "userId");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
