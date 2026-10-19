import { z } from "zod";
import { getSeatMap, publishSeatMap, saveDraft } from "@/lib/management/seat-map";
import { seatMapSchema } from "@/lib/seatmap/schema";
import { kitchenProcedure, router } from "../init";
import { stadiumSlug } from "../schemas";

const revision = z.number().int().min(0);

/** The venue designer. Drafts autosave; publishing syncs the stadium's sections. */
export const seatMapRouter = router({
  get: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => getSeatMap(input.stadium)),

  saveDraft: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, revision, doc: seatMapSchema }))
    .mutation(({ input }) => saveDraft(input.stadium, input.revision, input.doc)),

  publish: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, revision, doc: seatMapSchema }))
    .mutation(({ input }) => publishSeatMap(input.stadium, input.revision, input.doc)),
});
