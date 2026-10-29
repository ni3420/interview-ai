import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, upsertUserFromIdentity } from "./auth";

/** Drop declared values that are blank or oversized rather than trusting them. */
function declaredArg(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

/**
 * Mirror the verified Clerk identity onto `users` and return its id. Identity is
 * read from the JWT, never from arguments: a client that could pass a `clerkId`
 * here would overwrite or squat another account.
 *
 * The profile fields below are display data the client declares (S10). They can
 * fill the row's email/name/image columns when the JWT carries no such claim,
 * but they never select which row is written — that key is `identity.subject`.
 */
export const syncUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await upsertUserFromIdentity(ctx, {
      email: declaredArg(args.email, 320),
      name: declaredArg(args.name, 200),
      imageUrl: declaredArg(args.imageUrl, 2000),
    }),
});

/** `null` means signed out or not yet mirrored — reads this never has to throw. */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => await getAuthUser(ctx),
});

/**
 * `"anonymous"` is the window where Clerk says signed in but Convex has not
 * received the token yet, so a caller waits instead of writing.
 */
export const getSyncStatus = query({
  args: {},
  handler: async (ctx): Promise<"anonymous" | "unsynced" | "synced"> => {
    const user = await getAuthUser(ctx);
    if (user) return "synced";
    return (await ctx.auth.getUserIdentity()) ? "unsynced" : "anonymous";
  },
});
