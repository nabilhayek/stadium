/**
 * Runs `prisma migrate deploy` only for production builds on Vercel.
 *
 * Preview builds share the production database, so migrating from them would change live data before the
 * production code ships. Local builds (no VERCEL_ENV) skip it too: run `npm run db:deploy` yourself when needed.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

if (env !== "production") {
  console.log(`Skipping migrations (VERCEL_ENV=${env ?? "local"}); only production migrates.`);
  process.exit(0);
}

console.log("Production build: applying migrations.");
execSync("prisma migrate deploy", { stdio: "inherit" });
