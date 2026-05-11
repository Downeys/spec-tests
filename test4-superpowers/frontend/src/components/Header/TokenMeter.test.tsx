import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenMeter } from "./TokenMeter.js";

const BUDGET = { budget: 400_000, softWarn: 0.75, hardWarn: 0.9 };

describe("TokenMeter", () => {
  it("renders the count and budget", () => {
    render(<TokenMeter tokens={12345} tokenBudget={BUDGET} />);
    expect(screen.getByText(/12,345/)).toBeTruthy();
    expect(screen.getByText(/400,000/)).toBeTruthy();
  });

  it("uses default color below soft warn", () => {
    const { container } = render(<TokenMeter tokens={100_000} tokenBudget={BUDGET} />);
    expect(container.querySelector(".bg-gray-400")).toBeTruthy();
  });

  it("turns yellow and shows subtitle at >= soft warn", () => {
    const { container } = render(<TokenMeter tokens={310_000} tokenBudget={BUDGET} />);
    expect(container.querySelector(".bg-yellow-500")).toBeTruthy();
    expect(container.textContent).toContain("Consider wrapping up");
  });

  it("turns red and hides subtitle at >= hard warn (banner takes over)", () => {
    const { container } = render(<TokenMeter tokens={365_000} tokenBudget={BUDGET} />);
    expect(container.querySelector(".bg-red-500")).toBeTruthy();
    expect(container.textContent).not.toContain("Consider wrapping up");
  });
});
