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

async function deleteConversationCascade(ctx: MutationCtx, conversationId: Id<"conversations">) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();

  for (const m of messages) {
    const reactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", m._id))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(m._id);
  }

  const typing = await ctx.db
    .query("typingIndicators")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  await Promise.all(typing.map((t) => ctx.db.delete(t._id)));

  const members = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  await Promise.all(members.map((m) => ctx.db.delete(m._id)));

  await ctx.db.delete(conversationId);
}

export const findOrCreateConversation = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    if (me._id === args.userId) throw new Error("Cannot start a conversation with yourself");

    const myMemberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();

    for (const m of myMemberships) {
      const conversation = await ctx.db.get(m.conversationId);
      if (!conversation || (conversation.isGroup ?? false)) continue;
      const otherMembership = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_user", (q) =>
          q.eq("conversationId", conversation._id).eq("userId", args.userId),
        )
        .unique();
      if (otherMembership) return conversation._id;
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      isGroup: false,
      createdAt: now,
      lastMessageAt: undefined,
      name: undefined,
    });

    await ctx.db.insert("conversationMembers", { conversationId, userId: me._id, lastReadAt: 0 });
    await ctx.db.insert("conversationMembers", { conversationId, userId: args.userId, lastReadAt: 0 });
    return conversationId;
  },
});

export const createGroup = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");

    const members = Array.from(new Set([me._id, ...args.memberIds]));
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      isGroup: true,
      name,
      createdAt: now,
      lastMessageAt: undefined,
    });

    await Promise.all(
      members.map((userId) =>
        ctx.db.insert("conversationMembers", { conversationId, userId, lastReadAt: 0 }),
      ),
    );

    return conversationId;
  },
});

export const getUserConversations = query({
  args: {},
  handler: async (ctx) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);

    const myMemberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();

    const items = await Promise.all(
      myMemberships.map(async (m) => {
        const conversation = await ctx.db.get(m.conversationId);
        if (!conversation) return null;

        const legacyType = (conversation as { type?: string }).type;
        const isGroup = (conversation.isGroup ?? legacyType === "group") === true;

        const members = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .collect();

        const memberUsers = await Promise.all(members.map((mm) => ctx.db.get(mm.userId)));
        const users = memberUsers.filter((u): u is NonNullable<typeof u> => u !== null);

        const otherUser = isGroup
          ? null
          : (users.find((u) => u._id !== me._id) ?? null);

        if (!isGroup) {
          const placeholder =
            !otherUser || (otherUser.name === "Unknown" && !otherUser.email);
          if (placeholder) {
            return null;
          }
        }

        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .order("desc")
          .take(1);

        const last = lastMessage[0] ?? null;

        const unreadMessages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conversation._id).gt("createdAt", m.lastReadAt),
          )
          .collect();
        const unreadCount = unreadMessages.filter((msg) => msg.senderId !== me._id).length;

        return {
          conversationId: conversation._id,
          isGroup,
          name: conversation.name ?? "",
          memberCount: users.length,
          otherUser,
          lastMessageText: last ? (last.deleted ? "This message was deleted" : last.body) : "",
          lastMessageAt: last?.createdAt ?? 0,
          unreadCount,
        };
      }),
    );

    return items
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      return null;
    }

    let membership: { lastReadAt: number } | null = null;
    try {
      membership = await assertMembership(ctx, args.conversationId, me._id);
    } catch {
      return null;
    }

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    const memberUsers = await Promise.all(members.map((m) => ctx.db.get(m.userId)));
    const users = memberUsers.filter((u): u is NonNullable<typeof u> => u !== null);
    const otherUser = conversation.isGroup ? null : (users.find((u) => u._id !== me._id) ?? null);

    return {
      conversation,
      users,
      otherUser,
      lastReadAt: membership.lastReadAt,
    };
  },
});

export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const membership = await assertMembership(ctx, args.conversationId, me._id);
    await ctx.db.patch(membership._id, { lastReadAt: Date.now() });
    return membership._id;
  },
});

export const renameGroup = mutation({
  args: { conversationId: v.id("conversations"), name: v.string() },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const legacyType = (conversation as { type?: string }).type;
    const isGroup = (conversation.isGroup ?? legacyType === "group") === true;
    if (!isGroup) throw new Error("Not a group conversation");

    await assertMembership(ctx, args.conversationId, me._id);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");
    await ctx.db.patch(args.conversationId, { name });
    return args.conversationId;
  },
});

export const leaveGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const legacyType = (conversation as { type?: string }).type;
    const isGroup = (conversation.isGroup ?? legacyType === "group") === true;
    if (!isGroup) throw new Error("Not a group conversation");

    const membership = await assertMembership(ctx, args.conversationId, me._id);
    await ctx.db.delete(membership._id);

    const remainingMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    if (remainingMembers.length === 0) {
      await deleteConversationCascade(ctx, args.conversationId);
      return null;
    }

    return membership._id;
  },
});

export const deleteGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user: me } = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const legacyType = (conversation as { type?: string }).type;
    const isGroup = (conversation.isGroup ?? legacyType === "group") === true;
    if (!isGroup) throw new Error("Not a group conversation");

    await assertMembership(ctx, args.conversationId, me._id);
    await deleteConversationCascade(ctx, args.conversationId);
    return null;
  },
});
