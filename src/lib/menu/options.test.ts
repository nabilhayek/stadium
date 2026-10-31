import { describe, expect, it } from "vitest";
import {
  checkSelection,
  defaultSelection,
  groupRule,
  hasRequiredChoice,
  lineKey,
  unitPrice,
  type MenuOption,
  type MenuOptionGroup,
} from "./options";

function option(id: string, overrides: Partial<MenuOption> = {}): MenuOption {
  return { id, name: id, priceCents: 0, isDefault: false, isSoldOut: false, ...overrides };
}

function group(overrides: Partial<MenuOptionGroup> & Pick<MenuOptionGroup, "id" | "options">): MenuOptionGroup {
  return {
    name: "Group",
    selection: "SINGLE",
    required: false,
    maxSelect: null,
    ...overrides,
  };
}

describe("checkSelection", () => {
  const sauce = group({
    id: "sauce",
    name: "Sauce",
    selection: "SINGLE",
    required: true,
    options: [option("ketchup"), option("mustard")],
  });

  it("accepts valid single pick", () => {
    const r = checkSelection([sauce], ["ketchup"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.chosen).toEqual([{ id: "ketchup", group: "Sauce", name: "ketchup", cents: 0 }]);
      expect(r.extraCents).toBe(0);
    }
  });

  it("rejects duplicate ids", () => {
    const r = checkSelection([sauce], ["ketchup", "ketchup"]);
    expect(r).toEqual({ ok: false, groupId: null, message: "An option was picked twice." });
  });

  it("rejects sold out", () => {
    const g = group({ id: "g", options: [option("a", { isSoldOut: true })] });
    const r = checkSelection([g], ["a"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/sold out/i);
  });

  it("rejects multiple picks on SINGLE", () => {
    const r = checkSelection([sauce], ["ketchup", "mustard"]);
    expect(r).toEqual({ ok: false, groupId: "sauce", message: "Pick one sauce." });
  });

  it("rejects missing required pick", () => {
    const r = checkSelection([sauce], []);
    expect(r).toEqual({ ok: false, groupId: "sauce", message: "Choose sauce." });
  });

  it("rejects MULTIPLE over maxSelect", () => {
    const toppings = group({
      id: "top",
      name: "Toppings",
      selection: "MULTIPLE",
      required: false,
      maxSelect: 1,
      options: [option("a"), option("b")],
    });
    const r = checkSelection([toppings], ["a", "b"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/up to 1/i);
  });

  it("rejects unknown option id when required group is satisfied", () => {
    const optional = group({ id: "extra", name: "Extra", required: false, options: [option("ketchup")] });
    const r = checkSelection([optional], ["ghost"]);
    expect(r).toEqual({ ok: false, groupId: null, message: "That option is no longer on the menu." });
  });
});

describe("defaultSelection", () => {
  it("picks defaults respecting SINGLE limit and skipping sold out", () => {
    const groups = [
      group({
        id: "g1",
        selection: "SINGLE",
        options: [option("a", { isDefault: true }), option("b", { isDefault: true, isSoldOut: true })],
      }),
      group({
        id: "g2",
        selection: "MULTIPLE",
        maxSelect: 2,
        options: [option("x", { isDefault: true }), option("y", { isDefault: true }), option("z", { isDefault: true })],
      }),
    ];
    expect(defaultSelection(groups)).toEqual(["a", "x", "y"]);
  });
});

describe("lineKey", () => {
  it("uses product id alone when no options", () => {
    expect(lineKey("p1")).toBe("p1");
    expect(lineKey("p1", [])).toBe("p1");
  });

  it("sorts option ids", () => {
    expect(lineKey("p1", ["b", "a"])).toBe("p1|a,b");
  });
});

describe("unitPrice", () => {
  it("adds extras and floors at zero", () => {
    expect(unitPrice(500, 100)).toBe(600);
    expect(unitPrice(100, -200)).toBe(0);
  });
});

describe("hasRequiredChoice", () => {
  it("detects required groups", () => {
    expect(hasRequiredChoice([group({ id: "g", required: false, options: [option("a")] })])).toBe(false);
    expect(hasRequiredChoice([group({ id: "g", required: true, options: [option("a")] })])).toBe(true);
  });
});

describe("groupRule", () => {
  it("labels rules", () => {
    expect(groupRule({ selection: "SINGLE", required: true, maxSelect: null })).toBe("Pick 1");
    expect(groupRule({ selection: "MULTIPLE", required: true, maxSelect: 3 })).toBe("Pick 1 to 3");
  });
});
