import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

function normalizeName(name: string) {
  return name.trim() || "Unknown";
}

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: normalizeName(args.name),
        email: args.email,
        imageUrl: args.imageUrl,
        lastSeen: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: normalizeName(args.name),
      email: args.email,
      imageUrl: args.imageUrl,
      isOnline: false,
      lastSeen: now,
      createdAt: now,
    });
  },
});

export const syncFromClerk = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const now = Date.now();
    const name =
      args.name ??
      identity.nickname ??
      identity.name ??
      identity.givenName ??
      "Unknown";
    const email = args.email ?? identity.email ?? "";
    const imageUrl = args.imageUrl ?? identity.pictureUrl ?? "";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: normalizeName(name),
        email,
        imageUrl,
        lastSeen: now,
        createdAt: existing.createdAt ?? existing._creationTime,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: normalizeName(name),
      email,
      imageUrl,
      isOnline: true,
      lastSeen: now,
      createdAt: now,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const upsertUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const email = identity.email ?? "";
    const name =
      identity.nickname ??
      identity.name ??
      identity.givenName ??
      "Unknown";
    const imageUrl = identity.pictureUrl ?? "";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = {
        isOnline: true,
        lastSeen: now,
        createdAt: existing.createdAt ?? existing._creationTime,
      };
      if ((!existing.name || existing.name === "Unknown") && name && name !== "Unknown") {
        patch["name"] = normalizeName(name);
      }
      if (!existing.email && email) patch["email"] = email;
      if (!existing.imageUrl && imageUrl) patch["imageUrl"] = imageUrl;

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: normalizeName(name),
      email,
      imageUrl,
      isOnline: true,
      lastSeen: now,
      createdAt: now,
    });
  },
});

export const ensureFromIdentity = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const email = identity.email ?? "";
    const name =
      identity.nickname ??
      identity.name ??
      identity.givenName ??
      "Unknown";
    const imageUrl = identity.pictureUrl ?? "";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = {
        isOnline: true,
        lastSeen: now,
        createdAt: existing.createdAt ?? existing._creationTime,
      };
      if ((!existing.name || existing.name === "Unknown") && name && name !== "Unknown") {
        patch["name"] = normalizeName(name);
      }
      if (!existing.email && email) patch["email"] = email;
      if (!existing.imageUrl && imageUrl) patch["imageUrl"] = imageUrl;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: normalizeName(name),
      email,
      imageUrl,
      isOnline: true,
      lastSeen: now,
      createdAt: now,
    });
  },
});

export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const now = Date.now();
    const email = identity.email ?? "";
    const name =
      identity.nickname ??
      identity.name ??
      identity.givenName ??
      "Unknown";
    const imageUrl = identity.pictureUrl ?? "";

    if (!existing) {
      return await ctx.db.insert("users", {
        clerkId: identity.subject,
        name: normalizeName(name),
        email,
        imageUrl,
        isOnline: true,
        lastSeen: now,
        createdAt: now,
      });
    }

    const patch: Record<string, unknown> = {
      isOnline: true,
      lastSeen: now,
      createdAt: existing.createdAt ?? existing._creationTime,
    };
    if ((!existing.name || existing.name === "Unknown") && name && name !== "Unknown") {
      patch["name"] = normalizeName(name);
    }
    if (!existing.email && email) patch["email"] = email;
    if (!existing.imageUrl && imageUrl) patch["imageUrl"] = imageUrl;
    await ctx.db.patch(existing._id, patch);

    return existing._id;
  },
});

export const setOnline = mutation({
  args: { isOnline: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, { isOnline: args.isOnline, lastSeen: Date.now() });
    return existing._id;
  },
});

export const setOffline = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, { isOnline: false, lastSeen: Date.now() });
    return existing._id;
  },
});

export const getUsers = query({
  args: { searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!me) return [];

    const term = (args.searchTerm ?? "").trim().toLowerCase();
    const users = await ctx.db.query("users").withIndex("by_name").collect();
    const others = users.filter(
      (u) =>
        u._id !== me._id &&
        u.email !== me.email &&
        !(u.name === "Unknown" && !u.email),
    );
    if (!term) return others;
    return others.filter((u) => u.name.toLowerCase().includes(term));
  },
});

export const listOthers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const users = await ctx.db.query("users").withIndex("by_name").collect();
    if (!me) {
      return users.filter((u) => !(u.name === "Unknown" && !u.email));
    }
    return users.filter(
      (u) =>
        u._id !== me._id &&
        u.email !== me.email &&
        !(u.name === "Unknown" && !u.email),
    );
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const name = normalizeName(args.name);
    const patch: Record<string, unknown> = { name };
    if (args.imageUrl !== undefined) {
      patch["imageUrl"] = args.imageUrl.trim();
    }

    await ctx.db.patch(user._id, patch);
    return user._id;
  },
});
