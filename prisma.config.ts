import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { postgresConnectionString } from "./src/lib/pg-url";

config();
config({ path: ".env.local", override: true });

// Generate runs from `npm ci` before a database exists (the format job, a fresh
// clone). It never connects. Migrate and the app use the real URL when one is set.
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/stadium";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: postgresConnectionString(databaseUrl),
  },
});
