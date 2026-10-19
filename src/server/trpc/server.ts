import "server-only";
import { createContext } from "./init";
import { createCaller } from "./root";

/** tRPC for Server Components and route handlers: same procedures, no HTTP hop. */
export const api = createCaller(createContext);
