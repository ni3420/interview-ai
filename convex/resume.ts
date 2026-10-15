import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./auth";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_CONTENT_TYPE = "application/pdf";

// Returns a short-lived URL the client can POST the resume file to.
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireAuthUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Persists metadata for an uploaded resume. The caller must be authenticated;
// ownership is derived from the verified identity, never from client input.
export const saveResume = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    if (args.contentType !== RESUME_CONTENT_TYPE) {
      throw new Error("Unsupported file type. Only PDF resumes are allowed.");
    }
    if (args.size <= 0 || args.size > MAX_RESUME_BYTES) {
      throw new Error("Invalid file size.");
    }

    // Keep a single active resume per user: remove any previously stored file.
    const existing = await ctx.db
      .query("resumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const resume of existing) {
      if (resume.storageId !== args.storageId) {
        await ctx.storage.delete(resume.storageId);
      }
      await ctx.db.delete(resume._id);
    }

    const now = Date.now();
    return await ctx.db.insert("resumes", {
      userId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      status: "uploaded",
      uploadedAt: now,
      updatedAt: now,
    });
  },
});

export const getMyResume = query({
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    return await ctx.db
      .query("resumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

export const deleteResume = mutation({
  args: { resumeId: v.id("resumes") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const resume = await ctx.db.get(args.resumeId);
    if (!resume || resume.userId !== userId) throw new Error("Not found");

    await ctx.storage.delete(resume.storageId);
    await ctx.db.delete(resume._id);
    return { success: true };
  },
});
