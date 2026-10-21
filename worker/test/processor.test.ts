import { describe, expect, it } from "bun:test";
import { isTerminalFailure } from "../src/processor";

type Probe = Parameters<typeof isTerminalFailure>[0];

/**
 * Builds the minimal job surface `isTerminalFailure` needs. `state` is either
 * the state Redis reports or an error the probe should throw.
 */
function probe(
  state: string | Error,
  attemptsMade = 1,
  attempts: number | null = 3
): Probe {
  return {
    getState: async () => {
      if (state instanceof Error) throw state;
      return state;
    },
    attemptsMade,
    // null models a job created without an explicit attempts option.
    opts: attempts === null ? {} : { attempts },
  } as unknown as Probe;
}

describe("isTerminalFailure", () => {
  it("treats a job with another attempt scheduled as non-terminal", async () => {
    expect(await isTerminalFailure(probe("delayed"))).toBe(false);
    expect(await isTerminalFailure(probe("waiting"))).toBe(false);
    expect(await isTerminalFailure(probe("prioritized"))).toBe(false);
    expect(await isTerminalFailure(probe("waiting-children"))).toBe(false);
  });

  it("treats a failed job as terminal", async () => {
    expect(await isTerminalFailure(probe("failed"))).toBe(true);
  });

  it("treats a job that no longer exists as terminal", async () => {
    // removeOnFail can delete the job before the failed handler runs.
    expect(await isTerminalFailure(probe("unknown"))).toBe(true);
  });

  it("reports stalled jobs as terminal when the queue gives up on them", async () => {
    // A stalled-exhausted job is moved to failed without necessarily using up
    // every configured attempt, so attempt counters alone would miss it.
    expect(await isTerminalFailure(probe("failed", 1, 3))).toBe(true);
  });

  it("keeps a stalled job that is requeued in the retry state", async () => {
    expect(await isTerminalFailure(probe("waiting", 3, 3))).toBe(false);
  });

  it("falls back to attempt accounting when the queue is unreachable", async () => {
    expect(
      await isTerminalFailure(probe(new Error("redis down"), 1, 3))
    ).toBe(false);
    expect(
      await isTerminalFailure(probe(new Error("redis down"), 3, 3))
    ).toBe(true);
    expect(
      await isTerminalFailure(probe(new Error("redis down"), 1, null))
    ).toBe(true);
  });
});
