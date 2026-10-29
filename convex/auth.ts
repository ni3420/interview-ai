import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export async function getAuthUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  const user = await getAuthUser(ctx);
  return user?._id ?? null;
}

export async function requireAuthUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/**
 * Declared profile fields are UX data, never proof of who the caller is (S1,
 * S10): the row is keyed only by `identity.subject`, so a client can describe
 * itself but cannot address another account.
 */
export interface DeclaredProfile {
  email?: string;
  name?: string;
  imageUrl?: string;
}

const firstNonEmpty = (values: (string | undefined)[]) =>
  values.find((value) => value !== undefined && value !== "");

/**
 * Mirror the verified Clerk identity onto `users` and return its id. One
 * transaction, so two concurrent calls cannot both insert: the loser conflicts
 * and re-reads the winner's row from `by_clerk_id`.
 */
export async function upsertUserFromIdentity(
  ctx: MutationCtx,
  declared: DeclaredProfile = {}
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const clerkId = identity.subject;
  const email = firstNonEmpty([identity.email, declared.email, undefined]) ?? "";
  const name = firstNonEmpty([identity.name, declared.name]);
  const imageUrl = firstNonEmpty([identity.pictureUrl, declared.imageUrl]);

  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      // Keep the stored value when neither the token nor the client supplies one.
      email: email || existing.email,
      name: name ?? existing.name,
      imageUrl: imageUrl ?? existing.imageUrl,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("users", {
    clerkId,
    email,
    name,
    imageUrl,
    createdAt: now,
    updatedAt: now,
  });
}

export function userIdValidator() {
  return v.id("users");
}
