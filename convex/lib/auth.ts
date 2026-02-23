import type { UserIdentity } from "convex/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function getCurrentUserOrThrow(
  ctx: QueryCtx | MutationCtx,
): Promise<{ identity: UserIdentity; user: Doc<"users"> }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const db = ctx.db as QueryCtx["db"];

  const user = await db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  return { identity, user };
}
