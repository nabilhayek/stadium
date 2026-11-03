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
import { guarded, router } from "../init";

const productId = z.string().min(1);

/** Menu editing for the kitchen desk. Everything here needs `menu.edit` at the venue. Every write refreshes the shop. */
const menu = () => guarded("menu.edit");

export const productsRouter = router({
  list: menu().query(({ input }) => listProducts(input.stadium)),

  create: menu()
    .input(z.object({ product: productInput }))
    .mutation(({ input }) => createProduct(input.stadium, input.product)),

  update: menu()
    .input(z.object({ id: productId, product: productInput }))
    .mutation(({ ctx, input }) => updateProduct(input.stadium, input.id, input.product, { userId: ctx.session.user.id, email: ctx.session.user.email })),

  setFlags: menu()
    .input(
      z.object({
        id: productId,
        flags: z.object({ isAvailable: z.boolean().optional(), isSoldOut: z.boolean().optional() }),
      }),
    )
    .mutation(({ input }) => setProductFlags(input.stadium, input.id, input.flags)),

  delete: menu()
    .input(z.object({ id: productId }))
    .mutation(({ input }) => deleteProduct(input.stadium, input.id)),

  uploadToken: menu()
    .input(z.object({ filename: z.string().max(200), contentType: z.string().max(60) }))
    .mutation(({ input }) => imageUploadToken(input.stadium, input.filename, input.contentType)),

  discardImages: menu()
    .input(
      z.object({
        urls: z.array(z.url().refine((u) => new URL(u).hostname.endsWith(BLOB_HOST_SUFFIX))).max(50),
      }),
    )
    .mutation(({ input }) => discardImages(input.stadium, input.urls)),

  reorder: menu()
    .input(z.object({ categoryId: z.string().min(1), ids: z.array(productId).min(1).max(500) }))
    .mutation(({ input }) => reorderProducts(input.stadium, input.categoryId, input.ids)),

  saveCategories: menu()
    .input(z.object({ categories: categoriesInput }))
    .mutation(({ input }) => saveCategories(input.categories)),
});
