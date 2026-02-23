import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

http.route({
  path: "/clerk/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret =
      (process.env as Record<string, string | undefined>)["CLERK_WEBHOOK_SECRET"];
    if (!secret) {
      return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const payload = await request.text();
    let event: unknown;
    try {
      event = new Webhook(secret).verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    if (!isRecord(event)) {
      return new Response("Invalid payload", { status: 400 });
    }

    const eventType = event["type"];
    if (eventType === "user.created" || eventType === "user.updated") {
      const data = event["data"];
      if (!isRecord(data)) return new Response("Invalid payload", { status: 400 });

      const clerkId = typeof data["id"] === "string" ? data["id"] : null;
      if (!clerkId) return new Response("Invalid payload", { status: 400 });

      const emailAddresses = Array.isArray(data["email_addresses"])
        ? data["email_addresses"].filter(isRecord)
        : [];

      const primaryEmailId =
        typeof data["primary_email_address_id"] === "string"
          ? data["primary_email_address_id"]
          : null;

      const primaryEmailObj =
        (primaryEmailId
          ? emailAddresses.find((e) => e["id"] === primaryEmailId)
          : null) ?? emailAddresses[0] ?? null;

      const email =
        primaryEmailObj && typeof primaryEmailObj["email_address"] === "string"
          ? primaryEmailObj["email_address"]
          : "";

      const firstName = typeof data["first_name"] === "string" ? data["first_name"] : "";
      const lastName = typeof data["last_name"] === "string" ? data["last_name"] : "";
      const username = typeof data["username"] === "string" ? data["username"] : "";
      const imageUrl = typeof data["image_url"] === "string" ? data["image_url"] : "";

      const name = [firstName, lastName].filter(Boolean).join(" ");

      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId,
        name: name || username || email || "Unknown",
        email,
        imageUrl,
      });
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
