-- 2D venue drawing, one per stadium.

CREATE TABLE "SeatMap" (
    "id" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeatMap_stadiumId_key" ON "SeatMap"("stadiumId");

ALTER TABLE "SeatMap" ADD CONSTRAINT "SeatMap_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
