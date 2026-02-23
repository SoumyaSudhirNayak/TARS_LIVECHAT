import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./lib/auth";

async function assertMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_user", (q) => q.eq("conversationId", conversationId).eq("userId", userId))
    .unique();
  if (!membership) throw new Error("Forbidden");
  return membership;
}

export const setTyping = mutation({
  args: { conversationId: v.id("conversations"), isTyping: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    await assertMembership(ctx, args.conversationId, me._id);

    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", me._id),
      )
      .unique();

    const isTyping = args.isTyping ?? true;
    const expiresAt = isTyping ? Date.now() + 2000 : 0;

    if (existing) {
      await ctx.db.patch(existing._id, { expiresAt });
      return existing._id;
    }

    return await ctx.db.insert("typingIndicators", {
      conversationId: args.conversationId,
      userId: me._id,
      expiresAt,
    });
  },
});

export const getTypingUsers = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);

    const now = Date.now();
    const indicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const active = indicators.filter((i) => i.userId !== me._id && i.expiresAt > now);
    const users = await Promise.all(active.map((i) => ctx.db.get(i.userId)));
    return users.filter((u): u is NonNullable<typeof u> => u !== null);
  },
});
