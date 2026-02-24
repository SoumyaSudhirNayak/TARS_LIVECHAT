# Convex Backend – TARS Live Chat

This folder contains all backend logic for the chat application. Convex is used for:

- Storing users, conversations, messages, reactions, and typing indicators
- Handling real‑time updates to the UI (via live queries)
- Integrating with Clerk authentication

You normally do **not** need to write any server code outside this directory.

---

## 1. Where things live

- **Schema (database tables)**  
  `convex/schema.ts`  
  Defines tables:
  - `users`
  - `conversations`
  - `conversationMembers`
  - `messages`
  - `messageReactions`
  - `typingIndicators`

- **Auth config (Convex ⇄ Clerk)**  
  `convex/auth.config.ts`  
  Sets up a `customJwt` provider pointing to your Clerk instance. Convex uses this
  to trust JWTs issued by Clerk.

- **HTTP routes (Clerk webhooks)**  
  `convex/http.ts`  
  Exposes `/clerk/webhook` which:
  - Verifies requests using `CLERK_WEBHOOK_SECRET`
  - On `user.created` and `user.updated`, upserts a row in `users`

- **Core business logic**  
  - `convex/users.ts` – users, presence, profile sync
  - `convex/conversations.ts` – direct chats and group chats
  - `convex/messages.ts` – sending, listing, deleting, reacting to messages
  - `convex/typing.ts` – typing indicators
  - `convex/internal/maintenance.ts` – background jobs and data cleanup

These functions are called from the frontend using the auto‑generated `api` client
(`convex/_generated/api`).

---

## 2. Data model overview

### 2.1 Users

Table: `users`

- **Fields** (simplified):
  - `clerkId: string` – ID from Clerk
  - `name: string`
  - `email: string`
  - `imageUrl: string`
  - `isOnline: boolean`
  - `lastSeen: number` – timestamp (ms)
  - `createdAt?: number`
- **Indexes**:
  - `by_clerkId`
  - `by_name`

Users are created/updated from:

- Clerk webhook (`convex/http.ts` → `internal.users.upsertFromClerk`)
- Runtime sync when a user visits the app (`users.upsertUser`, `users.ensureFromIdentity`, `users.syncFromClerk`)

### 2.2 Conversations

Table: `conversations`

- Represents either:
  - A **direct chat** between two users, or
  - A **group chat** with many users
- **Important fields**:
  - `isGroup?: boolean`
  - `name?: string`
  - `createdAt?: number`
  - `lastMessageAt?: number`
  - Legacy support fields: `type?`, `directKey?` for old data

### 2.3 Conversation members

Table: `conversationMembers`

- One row per (conversation, user) pair
- Fields:
  - `conversationId`
  - `userId`
  - `lastReadAt: number` – used to compute unread message counts
- Indexes let us quickly find:
  - All members of a conversation
  - All conversations a user belongs to

### 2.4 Messages

Table: `messages`

- Fields:
  - `conversationId`
  - `senderId`
  - `body: string`
  - `createdAt: number`
  - `deleted: boolean` – soft delete flag

Messages are always linked to a conversation and sender.

### 2.5 Message reactions

Table: `messageReactions`

- Fields:
  - `messageId`
  - `userId`
  - `emoji: string`
- Used to show small emoji chips like 👍 ❤️ 😂 on each message.

### 2.6 Typing indicators

Table: `typingIndicators`

- Fields:
  - `conversationId`
  - `userId`
  - `expiresAt: number`
- Short‑lived rows that say “this user is typing in this conversation until this time”.

---

## 3. Main Convex functions

### 3.1 Users (`convex/users.ts`)

Key exported functions:

- `upsertFromClerk` (internal)  
  - Called from the Clerk webhook to create or update `users` rows.

- `upsertUser` / `ensureFromIdentity`  
  - Called from the frontend when a user first loads the app.
  - Ensures a Convex user row exists for the current Clerk identity.

- `heartbeat`, `setOnline`, `setOffline`  
  - Track presence and `lastSeen`.
  - Used by the frontend presence hook to keep users “online” while they are active.

- `me` (query)  
  - Returns the current user document or `null`.

- `getUsers`, `listOthers` (queries)  
  - Return other users for the sidebar (search, starting chats, adding to groups).
  - Filter out placeholder “Unknown” users.

- `updateProfile` (mutation)  
  - Used by the `/user-profile` page to save name and avatar changes.

### 3.2 Conversations (`convex/conversations.ts`)

Key exported functions:

- `findOrCreateConversation` (mutation)  
  - Direct chat: given `userId` of the other user:
    - If a 1‑to‑1 conversation already exists, return it.
    - Otherwise, create a new conversation and membership rows for both users.

- `createGroup` (mutation)  
  - Group chat: take a name and list of members, create the conversation and membership rows.

- `getUserConversations` (query)  
  - Returns all conversations the current user belongs to:
    - Direct or group
    - Includes `otherUser` (for direct) or `memberCount` (for group)
    - Includes `lastMessageText`, `lastMessageAt`
    - Computes `unreadCount` using `lastReadAt`

- `get` (query)  
  - Loads a specific conversation’s data:
    - Conversation document
    - Member users
    - `otherUser` for direct chats
    - `lastReadAt` for the current user
  - Returns `null` if the user is not a member.

- `markAsRead` (mutation)  
  - Updates `conversationMembers.lastReadAt`.
  - Used when the user views a conversation, clearing unread badges.

- `renameGroup`, `leaveGroup`, `deleteGroup` (mutations)  
  - Rename a group.
  - Leave a group (and delete it entirely if that was the last member).
  - Delete a group for all members, including messages, reactions, and typing indicators (via a helper that deletes related documents).

### 3.3 Messages (`convex/messages.ts`)

Key exported functions:

- `getMessages` (query)  
  - Returns messages for a conversation (with limit and correct ordering).
  - Attaches:
    - `sender` user (if present)
    - Aggregated reactions with counts and `reactedByMe` flag
  - If the user is not a member, returns an empty list instead of throwing.

- `sendMessage` (mutation)  
  - Validates non‑empty body.
  - Ensures the sender is a member (handles some legacy conversation formats).
  - Inserts the message and updates `conversation.lastMessageAt`.

- `deleteMessage` (mutation)  
  - Soft delete: only the original sender can mark `deleted = true`.

- `toggleReaction` (mutation)  
  - Adds or removes a reaction row for a specific `(messageId, userId, emoji)` combination.

### 3.4 Typing indicators (`convex/typing.ts`)

- `setTyping` (mutation)  
  - Marks the current user as typing (or not typing) in a conversation.
  - When typing:
    - Inserts or updates a row with `expiresAt = now + 2000` ms.
  - When not typing:
    - Marks or removes the indicator so the UI stops showing it.

- `getTypingUsers` (query)  
  - Returns a list of users who are currently typing in the given conversation.
  - Filters out:
    - The current user
    - Stale rows where `expiresAt <= now`

### 3.5 Maintenance jobs (`convex/internal/maintenance.ts`)

Contains internal mutations used for cleanup and backfills, for example:

- Backfilling missing `createdAt` fields
- Inferring members for legacy direct conversations
- Marking stale users offline
- Deleting expired typing indicators

These are **not** called from the UI directly, but can be run manually from the Convex dashboard or scripts.

---

## 4. How the frontend calls these functions

The Next.js frontend uses the generated Convex client:

- `convex/_generated/api` – type‑safe references to all functions
- `convex/react` – React hooks for queries and mutations

Typical usage in React:

```ts
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const conversations = useQuery(api.conversations.getUserConversations, {});
const sendMessage = useMutation(api.messages.sendMessage);
```

Important points:

- `useQuery` is **live**: whenever data changes in Convex, the UI updates automatically.
- `useMutation` can be called fire‑and‑forget or awaited. This app usually `await`s mutations to handle errors cleanly.

---

## 5. Running Convex locally

From the project root (`tars-livechat` folder, not this `convex` folder):

1. Install dependencies (once):

   ```bash
   npm install
   ```

2. Start Convex dev server:

   ```bash
   npx convex dev
   ```

   - This will:
     - Link to a Convex project (or ask you to create one)
     - Apply `schema.ts` so all tables exist

3. Start the Next.js dev server in another terminal:

   ```bash
   npm run dev
   ```

4. Open the app in the browser (`http://localhost:3000`) and sign in via Clerk.

Whenever you change Convex functions, it is a good idea to regenerate types:

```bash
npx convex codegen
```

---

## 6. Deploying Convex

To deploy your functions and schema to your Convex deployment:

```bash
npx convex deploy
```

This pushes all functions in this directory to the configured Convex project, so your production app can use them.

You can see more commands and open Convex docs with:

- `npx convex -h`
- `npx convex docs`
