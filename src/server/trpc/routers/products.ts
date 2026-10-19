import { z } from "zod";
import { BLOB_HOST_SUFFIX, categoriesInput, productInput } from "@/lib/management/product-input";
import {
  createProduct,
  deleteProduct,
  discardImages,
  imageUploadToken,
  listProducts,
  reorderProducts,
  saveCategories,
  setProductFlags,
  updateProduct,
} from "@/lib/management/products";
import { kitchenProcedure, router } from "../init";
import { stadiumSlug } from "../schemas";

const productId = z.string().min(1);

/** Menu editing for the kitchen desk. Every write refreshes the cached shop pages. */
export const productsRouter = router({
  list: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => listProducts(input.stadium)),

  create: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, product: productInput }))
    .mutation(({ input }) => createProduct(input.stadium, input.product)),

  update: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, id: productId, product: productInput }))
    .mutation(({ input }) => updateProduct(input.stadium, input.id, input.product)),

  setFlags: kitchenProcedure
    .input(
      z.object({
        stadium: stadiumSlug,
        id: productId,
        flags: z.object({ isAvailable: z.boolean().optional(), isSoldOut: z.boolean().optional() }),
      }),
    )
    .mutation(({ input }) => setProductFlags(input.stadium, input.id, input.flags)),

  delete: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, id: productId }))
    .mutation(({ input }) => deleteProduct(input.stadium, input.id)),

  uploadToken: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, filename: z.string().max(200), contentType: z.string().max(60) }))
    .mutation(({ input }) => imageUploadToken(input.stadium, input.filename, input.contentType)),

  discardImages: kitchenProcedure
    .input(
      z.object({
        stadium: stadiumSlug,
        urls: z.array(z.url().refine((u) => new URL(u).hostname.endsWith(BLOB_HOST_SUFFIX))).max(50),
      }),
    )
    .mutation(({ input }) => discardImages(input.stadium, input.urls)),

  reorder: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, categoryId: z.string().min(1), ids: z.array(productId).min(1).max(500) }))
    .mutation(({ input }) => reorderProducts(input.stadium, input.categoryId, input.ids)),

  saveCategories: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, categories: categoriesInput }))
    .mutation(({ input }) => saveCategories(input.categories)),
});
