import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ProcessingChecklist,
  getProcessingSteps,
} from "@/features/interview/lobby/processing-checklist";

describe("getProcessingSteps", () => {
  it("marks everything pending when no resume has been uploaded", () => {
    const steps = getProcessingSteps(undefined);
    expect(steps).toHaveLength(4);
    expect(steps.every((s) => s.state === "pending")).toBe(true);
  });

  it("marks the resume as received once uploaded", () => {
    const steps = getProcessingSteps("uploaded");
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("pending");
    expect(steps[2].state).toBe("pending");
    expect(steps[3].state).toBe("pending");
  });

  it("shows processing as active while work is in progress", () => {
    const steps = getProcessingSteps("processing");
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("active");
  });

  it("marks every step done once the resume is ready", () => {
    const steps = getProcessingSteps("ready");
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("surfaces an error when processing fails", () => {
    const steps = getProcessingSteps("failed");
    expect(steps[1].state).toBe("error");
  });
});

describe("ProcessingChecklist", () => {
  it("renders the preparation steps with an accessible label", () => {
    render(<ProcessingChecklist status="processing" />);
    expect(
      screen.getByRole("list", { name: "Interview preparation progress" })
    ).toBeInTheDocument();
    expect(screen.getByText("Resume received")).toBeInTheDocument();
    expect(screen.getByText("Processing resume")).toBeInTheDocument();
    expect(screen.getByText("Generating questions")).toBeInTheDocument();
    expect(screen.getByText("Ready to join")).toBeInTheDocument();
  });
});
