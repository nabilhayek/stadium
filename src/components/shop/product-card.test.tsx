import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../../../tests/support/render";
import type { MenuProduct } from "@/lib/queries/stadium";
import { ProductCard } from "./product-card";

vi.mock("framer-motion", () => ({
  m: {
    li: ({ children, ...props }: React.ComponentProps<"li">) => <li {...props}>{children}</li>,
  },
}));

vi.mock("@/lib/cart/use-cart", () => ({
  useProductQty: () => 0,
}));

function product(overrides: Partial<MenuProduct> = {}): MenuProduct {
  return {
    id: "p-cola",
    name: "Cola 0.5L",
    description: "Cold",
    imageUrl: null,
    priceCents: 350,
    categoryId: "c-drinks",
    isSoldOut: false,
    nutrition: null,
    allergens: [],
    optionGroups: [],
    ...overrides,
  };
}

const messages = {
  shop: {
    soldOut: "Sold out",
    add: "Add",
    addNamed: "Add {name}",
    addAnother: "Add another {name}, {count} in cart",
  },
};

describe("ProductCard", () => {
  it("shows sold out instead of add", () => {
    renderWithIntl(<ProductCard stadiumSlug="arena" currency="EUR" product={product({ isSoldOut: true })} />, messages);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
  });

  it("links to configure options with an Add label", () => {
    renderWithIntl(
      <ProductCard
        stadiumSlug="arena"
        currency="EUR"
        product={product({
          optionGroups: [
            {
              id: "g1",
              name: "Size",
              selection: "SINGLE",
              required: true,
              maxSelect: 1,
              options: [{ id: "o1", name: "Large", priceCents: 0, isDefault: true, isSoldOut: false }],
            },
          ],
        })}
      />,
      messages,
    );
    expect(screen.getByRole("link", { name: /^Add / })).toBeInTheDocument();
  });
});
