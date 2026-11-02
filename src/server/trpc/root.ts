import { createCallerFactory, router } from "./init";
import { adminRouter } from "./routers/admin";
import { kitchenRouter } from "./routers/kitchen";
import { ordersRouter } from "./routers/orders";
import { paymentsRouter } from "./routers/payments";
import { productsRouter } from "./routers/products";
import { privacyRouter } from "./routers/privacy";
import { pushRouter } from "./routers/push";
import { seatMapRouter } from "./routers/seat-map";
import { stadiumRouter } from "./routers/stadium";

export const appRouter = router({
  stadium: stadiumRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  kitchen: kitchenRouter,
  admin: adminRouter,
  products: productsRouter,
  seatMap: seatMapRouter,
  push: pushRouter,
  privacy: privacyRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
