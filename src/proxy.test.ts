import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { proxy } from "./proxy";

function request(path: string, init?: { cookie?: string; acceptLanguage?: string }) {
  const headers = new Headers();
  if (init?.acceptLanguage) headers.set("accept-language", init.acceptLanguage);
  const req = new NextRequest(`https://example.com${path}`, { headers });
  if (init?.cookie) {
    req.cookies.set(LOCALE_COOKIE, init.cookie);
  }
  return req;
}

describe("proxy locale rewrite", () => {
  it("passes through when path already has locale", () => {
    const res = proxy(request("/sv/arena?q=1"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites root using accept-language", () => {
    const res = proxy(request("/", { acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.8" }));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toMatch(/\/sv\/?$/);
  });

  it("prefers locale cookie over accept-language", () => {
    const res = proxy(request("/menu", { cookie: "da", acceptLanguage: "sv-SE" }));
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toMatch(/\/da\/menu$/);
  });

  it("preserves search params", () => {
    const res = proxy(request("/checkout?x=1", { cookie: "en" }));
    expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/en\/checkout\?x=1$/);
  });
});
