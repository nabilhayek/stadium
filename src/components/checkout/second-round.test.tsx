import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/orders/receipt";
import { SECOND_ROUND_MS } from "@/lib/orders/second-round";
import { SecondRound } from "./second-round";

vi.mock("framer-motion", () => ({
  m: {
    section: ({ children, ...props }: React.ComponentProps<"section">) => <section {...props}>{children}</section>,
    span: ({ children, ...props }: React.ComponentProps<"span">) => <span {...props}>{children}</span>,
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/trpc/react", () => ({
  useTRPC: () => ({
    payments: {
      extra: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/toast/toast-provider", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    orderNumber: "A-TEST",
    stadiumSlug: "arena",
    stadiumName: "Arena",
    seat: null,
    fulfillment: "delivery",
    timing: "asap",
    scheduledAt: null,
    etaMin: 10,
    etaMax: 15,
    paidAt: 1_000_000,
    readyAt: 1_000_000 + SECOND_ROUND_MS + 60_000,
    runnerNote: "",
    confirmCode: "1234",
    lines: [{ productId: "cola", name: "Cola", qty: 1, unitCents: 300 }],
    ...overrides,
  };
}

const drinks = [{ productId: "cola", name: "Cola", unitCents: 300, categoryId: "c-drinks", isSoldOut: false, needsChoice: false }];

describe("SecondRound", () => {
  it("hides when the second-round window has closed", () => {
    const r = receipt();
    const { container } = render(<SecondRound receipt={r} drinks={drinks} now={r.paidAt + SECOND_ROUND_MS + 1} onUpdate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Add a drink to this round")).not.toBeInTheDocument();
  });
});
