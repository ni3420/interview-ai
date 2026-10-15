import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResumeUpload } from "@/features/interview/ResumeUpload";

const mocks = vi.hoisted(() => ({
  generateUploadUrl: vi.fn(),
  saveResume: vi.fn(),
  deleteResume: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => {
    const key = String(ref);
    if (key.includes("generateUploadUrl")) return mocks.generateUploadUrl;
    if (key.includes("saveResume")) return mocks.saveResume;
    if (key.includes("deleteResume")) return mocks.deleteResume;
    return vi.fn();
  },
}));

describe("ResumeUpload", () => {
  const mockOnResumeUploaded = vi.fn();
  const mockOnResumeRemoved = vi.fn();
  const defaultProps = {
    onResumeUploaded: mockOnResumeUploaded,
    onResumeRemoved: mockOnResumeRemoved,
    isProcessing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateUploadUrl.mockResolvedValue("https://upload.example");
    mocks.saveResume.mockResolvedValue("resume-1");
    mocks.deleteResume.mockResolvedValue({ success: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ storageId: "storage-1" }),
    }) as unknown as typeof fetch;
  });

  it("renders the upload area", () => {
    render(<ResumeUpload {...defaultProps} />);

    expect(
      screen.getByText("Drag & drop your resume (PDF)")
    ).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("rejects a non-PDF file without uploading", async () => {
    render(<ResumeUpload {...defaultProps} />);
    const input = screen.getByLabelText("Upload resume PDF") as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "resume.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(mockOnResumeUploaded).not.toHaveBeenCalled();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uploads a PDF to Convex storage and reports the resume", async () => {
    render(<ResumeUpload {...defaultProps} />);
    const input = screen.getByLabelText("Upload resume PDF") as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File(["pdf"], "resume.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => {
      expect(mockOnResumeUploaded).toHaveBeenCalledWith({
        resumeId: "resume-1",
        fileName: "resume.pdf",
      });
    });

    expect(mocks.generateUploadUrl).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://upload.example",
      expect.objectContaining({ method: "POST" })
    );
    expect(mocks.saveResume).toHaveBeenCalledWith({
      storageId: "storage-1",
      fileName: "resume.pdf",
      contentType: "application/pdf",
      size: 3,
    });
  });
});
