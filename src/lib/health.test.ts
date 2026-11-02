import { afterEach, describe, expect, it } from "vitest";
import { healthBody } from "./health";

describe("healthBody", () => {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const deployment = process.env.VERCEL_DEPLOYMENT_ID;

  afterEach(() => {
    if (sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = sha;
    if (deployment === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = deployment;
  });

  it("returns ok and a build id without reading the database", () => {
    delete process.env.VERCEL_DEPLOYMENT_ID;
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    expect(healthBody()).toEqual({ ok: true, buildId: "abc123" });
  });
});
