import { describe, expect, it } from "vitest";
import { emailCopy, fill } from "./copy";
import { renderEmail } from "./html";

describe("email copy", () => {
  it("escapes a name inside the swedish invite", () => {
    const copy = emailCopy("sv");
    const subject = fill(copy.invite.subject, { stadium: "Metropolis Arena" }, "text");
    expect(subject).toBe("Du är inbjuden till kökdisken på Metropolis Arena");
    const html = renderEmail({
      locale: "sv",
      preheader: copy.invite.preheader,
      heading: copy.invite.heading,
      paragraphs: [fill(copy.invite.body, { name: "<Ada>", stadium: "Arena", role: "Kitchen" }, "html")],
      footer: copy.invite.ignore,
    });
    expect(html).toContain('lang="sv"');
    expect(html).toContain("&lt;Ada&gt;");
    expect(html).not.toContain("<Ada>");
  });

  it("keeps the same keys in every language", () => {
    const keys = Object.keys(emailCopy("en"));
    expect(Object.keys(emailCopy("sv"))).toEqual(keys);
    expect(Object.keys(emailCopy("da"))).toEqual(keys);
  });
});
