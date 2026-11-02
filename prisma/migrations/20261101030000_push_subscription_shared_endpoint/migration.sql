-- One browser endpoint may follow both an order and the desk at the same stadium.
ALTER TABLE "PushSubscription" DROP CONSTRAINT "PushSubscription_one_owner";
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_has_owner" CHECK (("orderNumber" IS NOT NULL) OR ("userId" IS NOT NULL));
