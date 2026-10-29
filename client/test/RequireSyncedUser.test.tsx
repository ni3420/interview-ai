import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  useUser: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  // Stable, like Next's router instance, so effect deps behave like production.
  router: { push: vi.fn() },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: mocks.useUser }));
vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

import UserSyncProvider from "@/components/layout/UserSyncProvider";
import RequireSyncedUser from "@/components/layout/RequireSyncedUser";

type SyncState = "anonymous" | "unsynced" | "synced" | undefined;

function renderProtected(syncState: SyncState, user: Record<string, unknown> = {}) {
  mocks.useUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    ...user,
  });
  mocks.useQuery.mockReturnValue(syncState);

  return render(
    <UserSyncProvider>
      <RequireSyncedUser>
        <p>Protected lobby content</p>
      </RequireSyncedUser>
    </UserSyncProvider>
  );
}

describe("RequireSyncedUser", () => {
  beforeEach(() => {
    mocks.router.push.mockReset();
    mocks.useQuery.mockReset();
    mocks.useMutation.mockReset();
    mocks.useMutation.mockReturnValue(vi.fn().mockResolvedValue("users-1"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps protected content unmounted until the backend confirms the account", async () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    renderProtected("unsynced");

    expect(screen.queryByText("Protected lobby content")).toBeNull();
    expect(
      await screen.findByText(/preparing your account/i)
    ).toBeInTheDocument();
    expect(syncUser).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the mutation when the provider re-renders", async () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    const { rerender } = renderProtected("unsynced");
    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(1));

    rerender(
      <UserSyncProvider>
        <RequireSyncedUser>
          <p>Protected lobby content</p>
        </RequireSyncedUser>
      </UserSyncProvider>
    );

    expect(syncUser).toHaveBeenCalledTimes(1);
  });

  it("waits during the token handshake instead of firing a doomed mutation", () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    renderProtected("anonymous");

    expect(screen.queryByText("Protected lobby content")).toBeNull();
    expect(syncUser).not.toHaveBeenCalled();
  });

  it("backfills the profile over a row that already exists", async () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    renderProtected("synced", {
      user: {
        primaryEmailAddress: { emailAddress: "abc@example.com" },
        fullName: "Abc User",
        imageUrl: "https://img.example/abc.png",
      },
    });

    expect(screen.getByText("Protected lobby content")).toBeInTheDocument();
    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(1));
    expect(syncUser).toHaveBeenCalledWith({
      email: "abc@example.com",
      name: "Abc User",
      imageUrl: "https://img.example/abc.png",
    });
  });

  it("never sends an identity argument, only declared profile fields", async () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    renderProtected("unsynced", {
      user: {
        id: "user_abc",
        primaryEmailAddress: { emailAddress: "abc@example.com" },
      },
    });

    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(1));
    expect(syncUser.mock.calls[0]?.[0]).not.toHaveProperty("clerkId");
    expect(syncUser.mock.calls[0]?.[0]).not.toHaveProperty("userId");
    expect(syncUser.mock.calls[0]?.[0]).toEqual({
      email: "abc@example.com",
      name: undefined,
      imageUrl: undefined,
    });
  });

  it("pushes the profile again when the Clerk profile changes", async () => {
    const syncUser = vi.fn().mockResolvedValue("users-1");
    mocks.useMutation.mockReturnValue(syncUser);

    renderProtected("synced", {
      user: {
        primaryEmailAddress: { emailAddress: "abc@example.com" },
        fullName: "Abc User",
      },
    });
    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(1));

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        primaryEmailAddress: { emailAddress: "abc@example.com" },
        fullName: "Abc User Renamed",
      },
    });
    render(
      <UserSyncProvider>
        <RequireSyncedUser>
          <p>Protected lobby content</p>
        </RequireSyncedUser>
      </UserSyncProvider>
    );

    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(2));
    expect(syncUser.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ name: "Abc User Renamed" })
    );
  });

  it("shows a retry and calls the mutation again after a failed sync", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const syncUser = vi.fn().mockRejectedValue(new Error("offline"));
    mocks.useMutation.mockReturnValue(syncUser);
    const user = userEvent.setup();

    renderProtected("unsynced");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be prepared/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Protected lobby content")).toBeNull();
    error.mockRestore();
  });

  it("names the degraded state when the backend never confirms the account", () => {
    vi.useFakeTimers();
    try {
      renderProtected("anonymous");

      expect(screen.queryByRole("alert")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not be prepared/i
      );
      expect(screen.queryByText("Protected lobby content")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("redirects a signed-out visitor and never mounts protected content", () => {
    renderProtected(undefined, { isSignedIn: false });

    expect(mocks.router.push).toHaveBeenCalledWith("/sign-in");
    expect(screen.queryByText("Protected lobby content")).toBeNull();
    expect(screen.getByText(/redirecting you to sign in/i)).toBeInTheDocument();
  });

  it("shows nothing but a pending state while Clerk is still loading", () => {
    renderProtected(undefined, { isLoaded: false, isSignedIn: false });

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Protected lobby content")).toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
