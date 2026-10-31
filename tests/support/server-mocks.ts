import { vi } from "vitest";

/**
 * Next-only modules that cannot load (or have no request) under plain Node.
 * Import this file FIRST in an integration test, before anything from `@/`.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
