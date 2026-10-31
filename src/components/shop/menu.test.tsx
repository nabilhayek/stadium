import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MenuCategory, MenuProduct } from "@/lib/queries/stadium";
import { renderWithIntl } from "../../../tests/support/render";
import { Menu } from "./menu";

vi.mock("framer-motion", () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, tag) =>
        function MotionStub({ children, ...props }: React.ComponentProps<"div"> & Record<string, unknown>) {
          const {
            initial: _initial,
            animate: _animate,
            exit: _exit,
            variants: _variants,
            whileInView: _whileInView,
            viewport: _viewport,
            transition: _transition,
            whileTap: _whileTap,
            layoutId: _layoutId,
            ...rest
          } = props;
          return React.createElement(String(tag), rest, children);
        },
    },
  );
  return {
    m: motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("@/lib/hooks/use-storage", () => ({
  useStorageValue: () => null,
}));

vi.mock("@/components/motion/entrance", () => ({
  useEntrance: () => false,
}));

vi.mock("./product-card", () => ({
  ProductCard: ({ product }: { product: MenuProduct }) => <li data-testid="product">{product.name}</li>,
}));

vi.mock("./popular-rail", () => ({
  PopularRail: () => null,
}));

const shopMessages = {
  shop: {
    searchMenu: "Search the menu",
    searchPlaceholder: "Search — coke, veggie, fries",
    clearSearch: "Clear search",
    searchHint: "Type 3 letters to search.",
    categories: "Categories",
    all: "All",
    lastOrdered: "Last ordered",
    popular: "Popular",
    nothingHere: "Nothing here",
    tryAnother: "Try another word, or clear the search.",
    nothingInCategory: "Nothing available in this category right now.",
  },
};

function product(id: string, name: string, categoryId: string): MenuProduct {
  return {
    id,
    name,
    description: "",
    imageUrl: null,
    priceCents: 100,
    categoryId,
    isSoldOut: false,
    nutrition: null,
    allergens: [],
    optionGroups: [],
  };
}

const categories: MenuCategory[] = [{ id: "c1", slug: "drinks", name: "Drinks", icon: null }];
const products = [product("p1", "Cola", "c1"), product("p2", "Water", "c1")];

describe("Menu", () => {
  it("filters after three characters and shows empty state", async () => {
    renderWithIntl(<Menu stadiumSlug="arena" currency="EUR" products={products} categories={categories} />, shopMessages);

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryAllByTestId("product")).toHaveLength(0);
    expect(screen.getByText("Try another word, or clear the search.")).toBeInTheDocument();
  });
});
