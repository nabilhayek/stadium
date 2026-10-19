import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";
import { postgresConnectionString } from "./src/lib/pg-url";

config();
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: postgresConnectionString(process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL")),
  },
});
