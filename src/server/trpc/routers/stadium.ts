import { z } from "zod";
import { getActiveStadiums, getStadiumMenu } from "@/lib/queries/stadium";
import { publicProcedure, router } from "../init";
import { stadiumSlug } from "../schemas";

export const stadiumRouter = router({
  /** Shop, checkout and desk pages all start from this. Null when the stadium is closed or unknown. */
  menu: publicProcedure.input(z.object({ slug: stadiumSlug })).query(({ input }) => getStadiumMenu(input.slug)),

  active: publicProcedure.query(() => getActiveStadiums()),
});
