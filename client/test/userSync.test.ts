import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx } from "./helpers";

// The real `convex/auth` helpers are exercised here: identity -> `users` row is
// the thing G-50 broke, so mocking it out would prove nothing.
import * as Users from "../../convex/users";
import * as Interviews from "../../convex/interviews";

const unwrap = <R,>(ref: unknown) =>
  (ref as unknown as { _handler: (ctx: unknown, args?: unknown) => R })._handler;

const syncUser = unwrap<Promise<unknown>>(Users.syncUser);
const getCurrentUser = unwrap<Promise<unknown>>(Users.getCurrentUser);
const getSyncStatus = unwrap<Promise<unknown>>(Users.getSyncStatus);
const createInterview = unwrap<Promise<unknown>>(Interviews.createInterview);

const q = {
  eq: (field: string, value: string) => ({ field, value }),
};

const identity = (overrides: Record<string, unknown> = {}) => ({
  subject: "user_abc",
  tokenIdentifier: "https://issuer.example#user_abc",
  issuer: "https://issuer.example",
  email: "abc@example.com",
  name: "Abc User",
  pictureUrl: "https://img.example/abc.png",
  ...overrides,
});

const existingUser = {
  _id: "users-1",
  clerkId: "user_abc",
  email: "stale@example.com",
  name: "Stale Name",
  createdAt: 1,
  updatedAt: 1,
};

// `by_clerk_id` is looked up with the subject from the JWT, never from args.
const clerkIdLookup = (ctx: ReturnType<typeof createMockCtx>) => {
  const call = ctx.db.withIndex.mock.calls[0];
  expect(call?.[0]).toBe("by_clerk_id");
  return (call?.[1] as (builder: typeof q) => { field: string; value: string })(q);
};

describe("Convex users sync (G-50, G-01)", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
    ctx.auth.getUserIdentity.mockResolvedValue(identity());
  });

  describe("syncUser", () => {
    it("mirrors the verified identity into a new users row", async () => {
      ctx.db.unique.mockResolvedValue(null);
      ctx.db.insert.mockResolvedValue("users-new");

      const result = await syncUser(ctx, {});

      expect(result).toBe("users-new");
      expect(clerkIdLookup(ctx)).toEqual({ field: "clerkId", value: "user_abc" });
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "users",
        expect.objectContaining({
          clerkId: "user_abc",
          email: "abc@example.com",
          name: "Abc User",
          imageUrl: "https://img.example/abc.png",
        })
      );
    });

    it("ignores a client-supplied clerkId and email", async () => {
      ctx.db.unique.mockResolvedValue(null);
      ctx.db.insert.mockResolvedValue("users-new");

      await syncUser(ctx, { clerkId: "user_victim", email: "victim@example.com" });

      expect(clerkIdLookup(ctx)).toEqual({ field: "clerkId", value: "user_abc" });
      const inserted = ctx.db.insert.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(inserted.clerkId).toBe("user_abc");
      expect(inserted.email).toBe("abc@example.com");
    });

    it("patches the existing row instead of inserting a second one", async () => {
      ctx.db.unique.mockResolvedValue(existingUser);
      ctx.db.patch.mockResolvedValue(undefined);

      const result = await syncUser(ctx, {});

      expect(result).toBe("users-1");
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "users-1",
        expect.objectContaining({
          email: "abc@example.com",
          name: "Abc User",
          imageUrl: "https://img.example/abc.png",
        })
      );
    });

    it("keeps the stored email when the token carries no email claim", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue(identity({ email: undefined }));
      ctx.db.unique.mockResolvedValue(existingUser);

      await syncUser(ctx, {});

      const patched = ctx.db.patch.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(patched.email).toBe("stale@example.com");
    });

    it("prefers the verified token claim over the declared one", async () => {
      ctx.db.unique.mockResolvedValue(null);
      ctx.db.insert.mockResolvedValue("users-new");

      await syncUser(ctx, {
        email: "declared@example.com",
        name: "Declared Name",
        imageUrl: "https://declared.example/x.png",
      });

      const inserted = ctx.db.insert.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(inserted.email).toBe("abc@example.com");
      expect(inserted.name).toBe("Abc User");
      expect(inserted.imageUrl).toBe("https://img.example/abc.png");
    });

    it("fills name, email and imageUrl from the declared profile when the token omits them", async () => {
      // The live failure: the Clerk `convex` JWT template carries only `sub`, so
      // identity-derived sync alone left the row with an empty email.
      ctx.auth.getUserIdentity.mockResolvedValue({
        subject: "user_abc",
        tokenIdentifier: "https://issuer.example#user_abc",
        issuer: "https://issuer.example",
      });
      ctx.db.unique.mockResolvedValue(existingUser);

      await syncUser(ctx, {
        email: "declared@example.com",
        name: "Declared Name",
        imageUrl: "https://declared.example/x.png",
      });

      expect(ctx.db.patch).toHaveBeenCalledWith(
        "users-1",
        expect.objectContaining({
          email: "declared@example.com",
          name: "Declared Name",
          imageUrl: "https://declared.example/x.png",
        })
      );
    });

    it("drops blank and oversized declared values instead of storing them", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue({
        subject: "user_abc",
        tokenIdentifier: "https://issuer.example#user_abc",
        issuer: "https://issuer.example",
      });
      ctx.db.unique.mockResolvedValue(existingUser);

      await syncUser(ctx, {
        email: "   ",
        name: "n".repeat(201),
        imageUrl: "https://declared.example/ok.png",
      });

      const patched = ctx.db.patch.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(patched.email).toBe("stale@example.com");
      expect(patched.name).toBe("Stale Name");
      expect(patched.imageUrl).toBe("https://declared.example/ok.png");
    });

    it("keeps the stored profile when neither token nor client supplies one", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue({
        subject: "user_abc",
        tokenIdentifier: "https://issuer.example#user_abc",
        issuer: "https://issuer.example",
      });
      ctx.db.unique.mockResolvedValue(existingUser);

      await syncUser(ctx, {});

      expect(ctx.db.patch).toHaveBeenCalledWith(
        "users-1",
        expect.objectContaining({
          email: "stale@example.com",
          name: "Stale Name",
        })
      );
    });

    it("writes nothing without a verified identity", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue(null);

      await expect(syncUser(ctx, {})).rejects.toThrow("Unauthorized");
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentUser", () => {
    it("returns null for a signed-in user whose row has not landed", async () => {
      ctx.db.unique.mockResolvedValue(null);

      await expect(getCurrentUser(ctx, {})).resolves.toBeNull();
    });

    it("returns the row once it exists", async () => {
      ctx.db.unique.mockResolvedValue(existingUser);

      await expect(getCurrentUser(ctx, {})).resolves.toEqual(existingUser);
    });

    it("returns null without an identity", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue(null);

      await expect(getCurrentUser(ctx, {})).resolves.toBeNull();
    });
  });

  describe("getSyncStatus", () => {
    it("reports anonymous while the token handshake is unfinished", async () => {
      ctx.auth.getUserIdentity.mockResolvedValue(null);

      await expect(getSyncStatus(ctx, {})).resolves.toBe("anonymous");
    });

    it("reports unsynced when the identity has no row yet", async () => {
      ctx.db.unique.mockResolvedValue(null);

      await expect(getSyncStatus(ctx, {})).resolves.toBe("unsynced");
    });

    it("reports synced once the row exists", async () => {
      ctx.db.unique.mockResolvedValue(existingUser);

      await expect(getSyncStatus(ctx, {})).resolves.toBe("synced");
    });
  });
});

describe("Convex interview reads (G-50)", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
    ctx.auth.getUserIdentity.mockResolvedValue(identity());
  });

  const getInterviews = unwrap<Promise<unknown>>(Interviews.getInterviews);
  const getInterview = unwrap<Promise<unknown>>(Interviews.getInterview);

  it("answers an empty list instead of throwing while the account is unsynced", async () => {
    ctx.db.unique.mockResolvedValue(null);

    await expect(getInterviews(ctx, {})).resolves.toEqual([]);
    expect(ctx.db.collect).not.toHaveBeenCalled();
  });

  it("answers null for a single interview while unsynced", async () => {
    ctx.db.unique.mockResolvedValue(null);

    await expect(
      getInterview(ctx, { interviewId: "interview-1" })
    ).resolves.toBeNull();
  });

  it("still hides another user's interview once the row exists", async () => {
    ctx.db.unique.mockResolvedValue(existingUser);
    ctx.db.get.mockResolvedValue({ ...existingUser, _id: "interview-1", userId: "users-other" });

    await expect(getInterview(ctx, { interviewId: "interview-1" })).resolves.toBeNull();
  });

  it("returns the caller's own interview", async () => {
    ctx.db.unique.mockResolvedValue(existingUser);
    ctx.db.get.mockResolvedValue({ _id: "interview-1", userId: "users-1" });

    await expect(getInterview(ctx, { interviewId: "interview-1" })).resolves.toEqual({
      _id: "interview-1",
      userId: "users-1",
    });
  });
});

describe("Convex createInterview ownership (G-50)", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
    ctx.auth.getUserIdentity.mockResolvedValue(identity());
  });

  it("creates the owner row in the same transaction when sync has not landed", async () => {
    ctx.db.unique.mockResolvedValue(null);
    ctx.db.insert.mockImplementation((table: string) =>
      Promise.resolve(table === "users" ? "users-new" : "interview-1")
    );

    const result = await createInterview(ctx, { jobDescription: "Test JD" });

    expect(result).toBe("interview-1");
    expect(ctx.db.insert.mock.calls.map(([table]) => table)).toEqual([
      "users",
      "interviews",
    ]);
    expect(ctx.db.insert.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ userId: "users-new", jobDescription: "Test JD" })
    );
  });

  it("reuses the existing owner row", async () => {
    ctx.db.unique.mockResolvedValue(existingUser);
    ctx.db.insert.mockResolvedValue("interview-1");

    await createInterview(ctx, { jobDescription: "Test JD" });

    expect(ctx.db.insert.mock.calls.map(([table]) => table)).toEqual([
      "interviews",
    ]);
    expect(ctx.db.insert.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ userId: "users-1" })
    );
  });

  it("inserts nothing without a verified identity", async () => {
    ctx.auth.getUserIdentity.mockResolvedValue(null);

    await expect(
      createInterview(ctx, { jobDescription: "Test JD" })
    ).rejects.toThrow("Unauthorized");
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
