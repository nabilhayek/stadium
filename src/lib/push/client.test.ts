import { describe, expect, it } from "vitest";
import { isIos, needsInstall, subscriptionKeys, urlBase64ToUint8Array } from "./client";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";

describe("needsInstall", () => {
  it("is true only for iOS Safari outside the home-screen app", () => {
    expect(needsInstall({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, hasPush: false })).toBe(true);
    expect(needsInstall({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, hasPush: true })).toBe(false);
    expect(needsInstall({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, hasPush: true })).toBe(false);
    expect(needsInstall({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, hasPush: false })).toBe(false);
  });

  it("treats an iPad that reports a Mac user agent as iOS", () => {
    expect(isIos(MAC, 5)).toBe(true);
    expect(isIos(MAC, 0)).toBe(false);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes URL-safe base64 without padding", () => {
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([0xfb, 0xff]);
    expect(urlBase64ToUint8Array("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM")).toHaveLength(65);
  });
});

describe("subscriptionKeys", () => {
  it("needs the endpoint and both keys", () => {
    expect(subscriptionKeys({ endpoint: "https://push.example.com/a", keys: { p256dh: "p", auth: "a" } })).toEqual({
      endpoint: "https://push.example.com/a",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(subscriptionKeys({ endpoint: "https://push.example.com/a", keys: { p256dh: "p" } })).toBeNull();
    expect(subscriptionKeys({ keys: { p256dh: "p", auth: "a" } })).toBeNull();
  });
});
