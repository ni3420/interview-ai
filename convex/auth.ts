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

/** Matched by the browser to choose the right degraded message. */
export const EMAIL_ALREADY_LINKED = "EMAIL_ALREADY_LINKED";

const firstNonEmpty = (values: (string | undefined)[]) =>
  values.find((value) => value !== undefined && value !== "");

/** One address is one account, so `A@x.com` and `a@x.com` are the same account. */
function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * The row that already owns `email`, ignoring the caller's own row. `first()`
 * rather than `unique()` because rows written before this rule can share an
 * address, and a thrown lookup would break sign-in for both of them.
 */
async function emailOwner(
  ctx: MutationCtx,
  email: string,
  exceptId?: Id<"users">
): Promise<Doc<"users"> | null> {
  if (!email) return null;
  const owner = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .order("asc")
    .first();
  return owner && owner._id !== exceptId ? owner : null;
}

/**
 * Mirror the verified Clerk identity onto `users` and return its id. One
 * transaction, so two concurrent calls cannot both insert: the loser conflicts
 * and re-reads the winner's row from `by_clerk_id`. An address that another
 * account already owns is never claimed a second time.
 */
export async function upsertUserFromIdentity(
  ctx: MutationCtx,
  declared: DeclaredProfile = {}
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const clerkId = identity.subject;
  const email = normalizeEmail(firstNonEmpty([identity.email, declared.email]));
  const name = firstNonEmpty([identity.name, declared.name]);
  const imageUrl = firstNonEmpty([identity.pictureUrl, declared.imageUrl]);

  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (existing) {
    // An address some other account owns never moves onto this one.
    const taken = await emailOwner(ctx, email, existing._id);
    await ctx.db.patch(existing._id, {
      // Keep the stored value when neither the token nor the client supplies one.
      email: taken ? existing.email : email || existing.email,
      name: name ?? existing.name,
      imageUrl: imageUrl ?? existing.imageUrl,
      updatedAt: now,
    });
    return existing._id;
  }

  if (await emailOwner(ctx, email)) {
    throw new Error(
      `${EMAIL_ALREADY_LINKED}: this email address already belongs to another account`
    );
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
