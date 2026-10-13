import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JobDescriptionInput } from "@/features/interview/JobDescriptionInput";

describe("JobDescriptionInput", () => {
  const mockOnChange = vi.fn();
  const defaultProps = {
    value: "",
    onChange: mockOnChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders job description input", () => {
    render(<JobDescriptionInput {...defaultProps} />);
    expect(screen.getByText("Job Description")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows character count", () => {
    render(<JobDescriptionInput {...defaultProps} value="Test job description" />);
    expect(screen.getByText("20 characters (30 more needed)")).toBeInTheDocument();
  });

  it("shows valid state when minimum characters met", () => {
    const longText = "A".repeat(50);
    render(<JobDescriptionInput {...defaultProps} value={longText} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText(/minimum 50 met/)).toBeInTheDocument();
  });

  it("calls onChange when text changes", () => {
    render(<JobDescriptionInput {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New job description" } });
    expect(mockOnChange).toHaveBeenCalledWith("New job description");
  });

  it("shows error when provided", () => {
    render(<JobDescriptionInput {...defaultProps} error="Job description is required" />);
    expect(screen.getByText("Job description is required")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("applies error styling when error provided", () => {
    render(<JobDescriptionInput {...defaultProps} error="Error message" />);
    const card = screen.getByText("Job Description").closest(".rounded-lg.border");
    expect(card).toHaveClass("border-destructive");
  });
});