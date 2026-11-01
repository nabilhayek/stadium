import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RangeSelect } from "./range-select";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("range=today"),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/arena/management/overview",
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children?: React.ReactNode }) => (
    <select aria-label="Time range" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectValue: () => null,
}));

describe("RangeSelect", () => {
  it("updates the range query param", async () => {
    const user = userEvent.setup();
    render(
      <RangeSelect
        value="today"
        options={[
          { value: "today", label: "Today" },
          { value: "7d", label: "Last 7 days" },
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Time range" }), "7d");

    expect(replace).toHaveBeenCalledWith("/arena/management/overview?range=7d", { scroll: false });
  });
});
