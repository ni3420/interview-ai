import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/features/components/common/Button";

describe("Button", () => {
  it("renders a native button with left and right icons", () => {
    render(
      <Button
        leftIcon={<span data-testid="left-icon" />}
        rightIcon={<span data-testid="right-icon" />}
      >
        Save
      </Button>
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('[data-testid="left-icon"]')).not.toBeNull();
    expect(button.querySelector('[data-testid="right-icon"]')).not.toBeNull();
  });

  it("slots asChild onto a single child element without extra icon siblings", () => {
    render(
      <Button asChild leftIcon={<span data-testid="left-icon" />}>
        <a href="/dashboard">Go to dashboard</a>
      </Button>
    );

    const link = screen.getByRole("link", { name: "Go to dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link.querySelector('[data-testid="left-icon"]')).not.toBeNull();
  });

  it("disables the button and shows a spinner while loading", () => {
    render(<Button loading>Submit</Button>);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).not.toBeNull();
  });
});
