import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResumeUpload } from "@/features/interview/ResumeUpload";

vi.mock("pdfjs-dist", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(() => Promise.resolve({
          getTextContent: vi.fn(() => Promise.resolve({
            items: [{ str: "Test resume content" }],
          })),
        })),
      }),
    })),
    GlobalWorkerOptions: { workerSrc: "" },
    version: "6.4.299",
  };
});

describe("ResumeUpload", () => {
  const mockOnResumeTextChange = vi.fn();
  const defaultProps = {
    onResumeTextChange: mockOnResumeTextChange,
    resumeText: "",
    isProcessing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders upload area", () => {
    render(<ResumeUpload {...defaultProps} />);
    expect(screen.getByText("Drag & drop your resume (PDF)")).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("shows file input when clicking upload area", () => {
    render(<ResumeUpload {...defaultProps} />);
    const label = screen.getByText("Drag & drop your resume (PDF)");
    fireEvent.click(label);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});