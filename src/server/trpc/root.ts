import { createCallerFactory, router } from "./init";
import { kitchenRouter } from "./routers/kitchen";
import { ordersRouter } from "./routers/orders";
import { paymentsRouter } from "./routers/payments";
import { productsRouter } from "./routers/products";
import { seatMapRouter } from "./routers/seat-map";
import { stadiumRouter } from "./routers/stadium";

export const appRouter = router({
  stadium: stadiumRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  kitchen: kitchenRouter,
  products: productsRouter,
  seatMap: seatMapRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
