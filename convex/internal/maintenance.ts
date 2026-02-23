import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const backfillConversations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    await Promise.all(
      conversations.map(async (c) => {
        const createdAt = (c as { createdAt?: number }).createdAt ?? c._creationTime;
        const isGroupRaw = (c as { isGroup?: boolean }).isGroup;
        const typeRaw = (c as { type?: string }).type;
        const isGroup = isGroupRaw ?? typeRaw === "group";

        const patch: Record<string, unknown> = {};
        if ((c as { createdAt?: number }).createdAt === undefined) patch["createdAt"] = createdAt;
        if ((c as { isGroup?: boolean }).isGroup === undefined) patch["isGroup"] = isGroup;

        if (isGroup) {
          const name = (c as { name?: string }).name;
          if (!name || name.trim() === "") patch["name"] = "Group chat";
        }

        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(c._id, patch);
        }
      }),
    );
  },
});

export const backfillUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    await Promise.all(
      users.map(async (u) => {
        const createdAt = (u as { createdAt?: number }).createdAt;
        if (createdAt !== undefined) return;
        await ctx.db.patch(u._id, { createdAt: u._creationTime });
      }),
    );
  },
});

export const backfillConversationMembersFromDirectKey = internalMutation({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    await Promise.all(
      conversations.map(async (c) => {
        const directKey = (c as { directKey?: string }).directKey;
        if (!directKey || typeof directKey !== "string") return;

        const existingMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
          .collect();
        if (existingMembers.length > 0) return;

        const parts = directKey.split("_").filter(Boolean);
        if (parts.length !== 2) return;
        const [userA, userB] = parts;
        if (typeof userA !== "string" || typeof userB !== "string") return;

        await Promise.all([
          ctx.db.insert("conversationMembers", {
            conversationId: c._id,
            userId: userA as Id<"users">,
            lastReadAt: 0,
          }),
          ctx.db.insert("conversationMembers", {
            conversationId: c._id,
            userId: userB as Id<"users">,
            lastReadAt: 0,
          }),
        ]);

        if ((c as { isGroup?: boolean }).isGroup === undefined) {
          await ctx.db.patch(c._id, { isGroup: false, createdAt: c._creationTime });
        }
      }),
    );
  },
});

export const markStaleUsersOffline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleAfterMs = 60_000;

    const onlineUsers = (await ctx.db.query("users").collect()).filter((u) => u.isOnline);

    await Promise.all(
      onlineUsers.map(async (u) => {
        if (now - u.lastSeen > staleAfterMs) {
          await ctx.db.patch(u._id, { isOnline: false });
        }
      }),
    );
  },
});

export const deleteExpiredTypingIndicators = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = (await ctx.db.query("typingIndicators").collect()).filter(
      (t) => t.expiresAt <= now,
    );
    await Promise.all(expired.map((t) => ctx.db.delete(t._id)));
  },
});
