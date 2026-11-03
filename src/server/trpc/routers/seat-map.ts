import { z } from "zod";
import { getSeatMap, publishSeatMap, saveDraft } from "@/lib/management/seat-map";
import { seatMapSchema } from "@/lib/seatmap/schema";
import { guarded, router } from "../init";

const revision = z.number().int().min(0);

/** The venue designer. Drafts autosave; publishing syncs the stadium's sections. Needs `seatmap.edit`. */
export const seatMapRouter = router({
  get: guarded("seatmap.edit").query(({ input }) => getSeatMap(input.stadium)),

  saveDraft: guarded("seatmap.edit")
    .input(z.object({ revision, doc: seatMapSchema }))
    .mutation(({ input }) => saveDraft(input.stadium, input.revision, input.doc)),

  publish: guarded("seatmap.edit")
    .input(z.object({ revision, doc: seatMapSchema }))
    .mutation(({ ctx, input }) => publishSeatMap(input.stadium, input.revision, input.doc, { userId: ctx.session.user.id, email: ctx.session.user.email })),
});
