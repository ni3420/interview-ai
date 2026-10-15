import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResumeUpload } from "@/features/interview/ResumeUpload";

const EXTRACTED_TEXT =
  "Test resume content that is comfortably longer than the fifty character minimum threshold.";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  version: "6.4.299",
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() =>
        Promise.resolve({
          getTextContent: vi.fn(() =>
            Promise.resolve({ items: [{ str: EXTRACTED_TEXT }] })
          ),
        })
      ),
    }),
  })),
}));

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

  it("renders the upload area", () => {
    render(<ResumeUpload {...defaultProps} />);

    expect(
      screen.getByText("Drag & drop your resume (PDF)")
    ).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("rejects a non-PDF file without extracting text", async () => {
    render(<ResumeUpload {...defaultProps} />);
    const input = screen.getByLabelText(
      /Drag & drop your resume/i
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(["not a pdf"], "resume.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(mockOnResumeTextChange).not.toHaveBeenCalled();
    });
  });

  it("extracts text from a PDF and reports it", async () => {
    render(<ResumeUpload {...defaultProps} />);
    const input = screen.getByLabelText(
      /Drag & drop your resume/i
    ) as HTMLInputElement;

    const pdfFile = new File(["pdf bytes"], "resume.pdf", {
      type: "application/pdf",
    });
    // jsdom's File may not implement arrayBuffer(); provide one for extraction.
    if (typeof pdfFile.arrayBuffer !== "function") {
      (pdfFile as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer =
        async () => new ArrayBuffer(8);
    }

    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(mockOnResumeTextChange).toHaveBeenCalledWith(
        expect.stringContaining("Test resume content")
      );
    });
  });
});
