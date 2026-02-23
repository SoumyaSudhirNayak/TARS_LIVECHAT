import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./lib/auth";

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"] as const;

function isAllowedEmoji(emoji: string) {
  return (ALLOWED_EMOJIS as readonly string[]).includes(emoji);
}

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

async function ensureDirectMembershipFromDirectKey(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  meId: Id<"users">,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  const directKey = (conversation as { directKey?: string }).directKey;
  if (!directKey) throw new Error("Forbidden");

  const parts = directKey.split("_").filter(Boolean);
  if (parts.length !== 2) throw new Error("Forbidden");

  const a = parts[0] as Id<"users">;
  const b = parts[1] as Id<"users">;
  if (meId !== a && meId !== b) throw new Error("Forbidden");

  const otherId = meId === a ? b : a;

  const [meMembership, otherMembership] = await Promise.all([
    ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", meId),
      )
      .unique(),
    ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", otherId),
      )
      .unique(),
  ]);

  if (!meMembership) {
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: meId,
      lastReadAt: 0,
    });
  }
  if (!otherMembership) {
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: otherId,
      lastReadAt: 0,
    });
  }
}

export const getMessages = query({
  args: { conversationId: v.id("conversations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    try {
      await assertMembership(ctx, args.conversationId, me._id);
    } catch {
      return [];
    }

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const messagesDesc = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit);
    const messages = messagesDesc.reverse();

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const senders = await Promise.all(senderIds.map((id) => ctx.db.get(id)));
    const senderById = new Map(senderIds.map((id, i) => [id, senders[i] ?? null]));

    const messageIds = messages.map((m) => m._id);
    const reactionRows = (
      await Promise.all(
        messageIds.map((messageId) =>
          ctx.db
            .query("messageReactions")
            .withIndex("by_message", (q) => q.eq("messageId", messageId))
            .collect(),
        ),
      )
    ).flat();

    const reactionsByMessageId = new Map<string, { emoji: string; userId: string }[]>();
    for (const r of reactionRows) {
      const key = r.messageId as unknown as string;
      const arr = reactionsByMessageId.get(key) ?? [];
      arr.push({ emoji: r.emoji, userId: r.userId as unknown as string });
      reactionsByMessageId.set(key, arr);
    }

    return messages.map((m) => {
      const reactionsRaw = reactionsByMessageId.get(m._id as unknown as string) ?? [];
      const counts = new Map<string, number>();
      const mine = new Set<string>();
      for (const rr of reactionsRaw) {
        counts.set(rr.emoji, (counts.get(rr.emoji) ?? 0) + 1);
        if (rr.userId === (me._id as unknown as string)) mine.add(rr.emoji);
      }

      const reactions = ALLOWED_EMOJIS.map((emoji) => ({
        emoji,
        count: counts.get(emoji) ?? 0,
        reactedByMe: mine.has(emoji),
      })).filter((r) => r.count > 0 || r.reactedByMe);

      return {
        ...m,
        sender: senderById.get(m.senderId) ?? null,
        reactions,
      };
    });
  },
});

export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");

    try {
      await assertMembership(ctx, args.conversationId, me._id);
    } catch {
      await ensureDirectMembershipFromDirectKey(ctx, args.conversationId, me._id);
      await assertMembership(ctx, args.conversationId, me._id);
    }

    const createdAt = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: me._id,
      body,
      createdAt,
      deleted: false,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: createdAt,
    });

    return messageId;
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    await assertMembership(ctx, message.conversationId, me._id);
    if (message.senderId !== me._id) throw new Error("Forbidden");
    if (message.deleted) return message._id;
    await ctx.db.patch(message._id, { deleted: true });
    return message._id;
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    if (!isAllowedEmoji(args.emoji)) throw new Error("Invalid emoji");
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    await assertMembership(ctx, message.conversationId, me._id);

    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_user_emoji", (q) =>
        q.eq("messageId", args.messageId).eq("userId", me._id).eq("emoji", args.emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { removed: true };
    }

    await ctx.db.insert("messageReactions", {
      messageId: args.messageId,
      userId: me._id,
      emoji: args.emoji,
    });
    return { removed: false };
  },
});
