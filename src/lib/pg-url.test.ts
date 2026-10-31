import { describe, expect, it } from "vitest";
import { postgresConnectionString } from "./pg-url";

describe("postgresConnectionString", () => {
  it("passes through undefined", () => {
    expect(postgresConnectionString(undefined)).toBeUndefined();
  });

  it("rewrites sslmode aliases to verify-full", () => {
    expect(postgresConnectionString("postgres://u:p@h/db?sslmode=require")).toBe("postgres://u:p@h/db?sslmode=verify-full");
    expect(postgresConnectionString("postgres://u:p@h/db?foo=1&sslmode=prefer&bar=2")).toBe(
      "postgres://u:p@h/db?foo=1&sslmode=verify-full&bar=2",
    );
    expect(postgresConnectionString("postgres://u:p@h/db?sslmode=verify-ca")).toBe("postgres://u:p@h/db?sslmode=verify-full");
  });

  it("leaves verify-full and other modes alone", () => {
    const url = "postgres://u:p@h/db?sslmode=verify-full";
    expect(postgresConnectionString(url)).toBe(url);
  });
});
