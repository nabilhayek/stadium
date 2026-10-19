import "server-only";
import { revalidatePath } from "next/cache";
import { withDb } from "@/lib/db";
import { emptySeatMap, parseSeatMap, type SeatMapDoc } from "@/lib/seatmap/schema";
import { validateSeatMap } from "@/lib/seatmap/validate";
import type { Result } from "./products";

export type VenueSection = { code: string; name: string };

export type SeatMapState = {
  stadiumName: string;
  draft: SeatMapDoc;
  revision: number;
  publishedAt: number | null;
  /** The stadium's Section rows today: the publish diff compares against these. */
  sections: VenueSection[];
};

export async function getSeatMap(slug: string): Promise<SeatMapState | null> {
  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({
      where: { slug },
      select: {
        name: true,
        seatMap: { select: { draft: true, revision: true, publishedAt: true } },
        sections: { orderBy: { sortOrder: "asc" }, select: { code: true, name: true } },
      },
    });
    if (!stadium) return null;
    return {
      stadiumName: stadium.name,
      draft: (stadium.seatMap && parseSeatMap(stadium.seatMap.draft)) || emptySeatMap(),
      revision: stadium.seatMap?.revision ?? 0,
      publishedAt: stadium.seatMap?.publishedAt?.getTime() ?? null,
      sections: stadium.sections,
    };
  });
}

/** The live map other surfaces should draw. Null until the first publish. */
export async function getPublishedSeatMap(slug: string): Promise<SeatMapDoc | null> {
  const row = await withDb((db) => db.seatMap.findFirst({ where: { stadium: { slug } }, select: { published: true } }));
  return row?.published ? parseSeatMap(row.published) : null;
}

const STALE = "This map changed in another tab. Reload to get the latest version.";

/** Saves only when `revision` is still current, so an old tab can't overwrite newer work. */
export async function saveDraft(slug: string, revision: number, doc: SeatMapDoc): Promise<Result<{ revision: number }>> {
  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({ where: { slug }, select: { id: true } });
    if (!stadium) return { ok: false, error: "Stadium not found." };
    if (revision === 0) {
      const existing = await db.seatMap.findUnique({ where: { stadiumId: stadium.id }, select: { id: true } });
      if (existing) return { ok: false, error: STALE };
      await db.seatMap.create({ data: { stadiumId: stadium.id, draft: doc, revision: 1 } });
      return { ok: true, revision: 1 };
    }
    const { count } = await db.seatMap.updateMany({
      where: { stadiumId: stadium.id, revision },
      data: { draft: doc, revision: { increment: 1 } },
    });
    if (!count) return { ok: false, error: STALE };
    return { ok: true, revision: revision + 1 };
  });
}

export type PublishResult = Result<{
  revision: number;
  publishedAt: number;
  sections: VenueSection[];
  /** Sections no longer on the map but kept because orders point at them. */
  kept: string[];
}>;

/**
 * Makes the draft live and turns its sections into the stadium's Section rows,
 * matched by code. Sections that left the map are deleted unless orders use them.
 */
export async function publishSeatMap(slug: string, revision: number, doc: SeatMapDoc): Promise<PublishResult> {
  const blocking = validateSeatMap(doc).filter((i) => i.level === "error");
  if (blocking.length) return { ok: false, error: blocking[0].message };

  const result = await withDb(async (db) => {
    const stadium = await db.stadium.findUnique({ where: { slug }, select: { id: true } });
    if (!stadium) return { ok: false as const, error: "Stadium not found." };

    return db.$transaction(async (tx) => {
      const now = new Date();
      if (revision === 0) {
        const existing = await tx.seatMap.findUnique({ where: { stadiumId: stadium.id }, select: { id: true } });
        if (existing) return { ok: false as const, error: STALE };
        await tx.seatMap.create({ data: { stadiumId: stadium.id, draft: doc, published: doc, publishedAt: now, revision: 1 } });
      } else {
        const { count } = await tx.seatMap.updateMany({
          where: { stadiumId: stadium.id, revision },
          data: { draft: doc, published: doc, publishedAt: now, revision: { increment: 1 } },
        });
        if (!count) return { ok: false as const, error: STALE };
      }

      const onMap = new Set(doc.sections.map((s) => s.code));
      for (const [i, s] of doc.sections.entries()) {
        await tx.section.upsert({
          where: { stadiumId_code: { stadiumId: stadium.id, code: s.code } },
          create: { stadiumId: stadium.id, code: s.code, name: s.name, sortOrder: i },
          update: { name: s.name, sortOrder: i },
        });
      }

      const leaving = await tx.section.findMany({
        where: { stadiumId: stadium.id, code: { notIn: [...onMap] } },
        select: { id: true, code: true, _count: { select: { orders: true } } },
      });
      const removable = leaving.filter((s) => s._count.orders === 0).map((s) => s.id);
      if (removable.length) await tx.section.deleteMany({ where: { id: { in: removable } } });
      const kept = leaving.filter((s) => s._count.orders > 0).map((s) => s.code);
      if (kept.length) {
        await tx.section.updateMany({ where: { stadiumId: stadium.id, code: { in: kept } }, data: { sortOrder: doc.sections.length } });
      }

      const sections = await tx.section.findMany({
        where: { stadiumId: stadium.id },
        orderBy: { sortOrder: "asc" },
        select: { code: true, name: true },
      });
      return { ok: true as const, revision: revision + 1, publishedAt: now.getTime(), sections, kept };
    }, { timeout: 30_000, maxWait: 10_000 });
  });

  if (result.ok) revalidatePath(`/${slug}`, "layout");
  return result;
}
