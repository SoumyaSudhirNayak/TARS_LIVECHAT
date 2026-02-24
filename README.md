# TARS Live Chat

TARS Live Chat is a full‑stack, real‑time chat application built with:

- **Next.js App Router** (TypeScript, React)
- **Convex** for database + realtime backend
- **Clerk** for authentication
- **Tailwind CSS + shadcn/ui** for UI components

The goal is to provide a production‑ready chat experience with:

- Sign‑in via Clerk
- User list and search
- Direct (1‑to‑1) messages
- Group chats with rename / leave / delete
- Typing indicators
- Message reactions
- Unread message counts
- Smart auto‑scroll
- Robust loading and error states



---

## 1. Features Overview

- **Authentication**
  - Email / social sign‑in via Clerk
  - Convex uses Clerk JWTs to authenticate API calls

- **User profiles**
  - Each signed‑in user has a Convex `users` document
  - Custom `/user-profile` page to edit:
    - Display name
    - Avatar image URL
  - Changes are saved to Convex with an explicit **Save** button and **Back** to chat

- **User list & search**
  - Sidebar shows all other users
  - Search by name
  - Online/offline status indicator
  - Buttons to start a direct chat or add users to a group

- **Direct messages**
  - One‑to‑one conversations created on demand
  - Conversation list shows last message, timestamp, and unread badge

- **Group chats**
  - Create groups from selected users with a group name
  - Group header shows name and member count
  - Inline rename from the header (Edit → Save)
  - Leave group (removes only you; deletes if last member leaves)
  - Delete group (removes conversation + messages + reactions + typing indicators)

- **Messaging**
  - Real‑time message updates via Convex live queries
  - Soft delete: your own messages can be “deleted” and show as *This message was deleted*

- **Reactions**
  - Quick emoji reactions: 👍 ❤️ 😂 😮 😢
  - Reaction counts aggregated per emoji
  - Your own reactions are highlighted

- **Typing indicator**
  - Shows who is typing in a conversation
  - Appears inside the chat as a small bubble with animated dots
  - Automatically disappears after a short period of inactivity

- **Unread counts**
  - Per‑conversation badge in the sidebar
  - Cleared when you view that conversation

- **Smart auto‑scroll**
  - Automatically scrolls to the bottom when you are near the latest message
  - If you scroll up, new messages do not yank the scroll; instead you see a
    **↓ New messages** button to jump back to the bottom

- **Loading & error states**
  - “Setting up your account…”, “Loading messages…”, “No messages yet” etc.
  - Retry UI if sending a message fails
  - Chat route has an error boundary with a friendly fallback

---

## 2. Tech Stack

- **Frontend**
  - Next.js (App Router, TypeScript)
  - React
  - Tailwind CSS
  - shadcn/ui components (Button, Input, Avatar, ScrollArea, DropdownMenu, Textarea, etc.)

- **Backend**
  - Convex for:
    - Database (hosted)
    - Realtime subscriptions (`useQuery`)
    - Type‑safe functions (`query`, `mutation`)

- **Auth**
  - Clerk for user accounts, sessions, and JWTs
  - Convex `auth.config.ts` integrates Clerk’s JWT template

---

## 3. Project Structure

Top‑level layout (simplified):

- `convex/`
  - Convex backend (schema, functions, auth, webhooks)
  - See `convex/README.md` for detailed backend documentation

- `src/app/`
  - Next.js app router routes
  - `layout.tsx` – root layout, wraps app with Clerk and Convex providers
  - `page.tsx` – landing page (redirects to sign‑in or `/chat`)

- `src/app/chat/`
  - `layout.tsx` – chat layout wrapper
  - `page.tsx` – empty state when no conversation is selected
  - `error.tsx` – error boundary for chat

- `src/app/chat/[conversationId]/`
  - `page.tsx` – route entry for each conversation
  - `ChatThread.tsx` – main chat thread UI and logic:
    - Loads messages and typing indicators
    - Handles auto‑scroll, sending, deleting, reactions
    - Renders typing bubble and send error/retry UI

- `src/app/user-profile/`
  - `page.tsx` – custom profile editor backed by Convex `users` table

- `src/components/`
  - `ConvexClientProvider.tsx` – sets up Convex with Clerk on the client
  - `ui/` – shadcn/ui primitives

- `src/lib/`
  - `formatTimestamp.ts` – helper to display message timestamps (today / this year / older)
  - `utils.ts` – small utility functions (`cn` for class names, etc.)

---

## 4. Convex Backend (High‑Level)

For a full backend explanation, read `convex/README.md`. This section is a quick summary:

- **Schema (`convex/schema.ts`)**
  - Tables:
    - `users` – profile, presence
    - `conversations` – direct and group chats
    - `conversationMembers` – linking users to conversations, tracking `lastReadAt`
    - `messages` – message body, sender, timestamps, soft delete
    - `messageReactions` – emoji reactions
    - `typingIndicators` – who is typing in which conversation

- **Key functions**
  - `users.ts`:
    - Sync from Clerk
    - Presence heartbeats
    - `me`, `getUsers`, `updateProfile`
  - `conversations.ts`:
    - `findOrCreateConversation` (direct)
    - `createGroup`, `renameGroup`, `leaveGroup`, `deleteGroup`
    - `getUserConversations`, `get`, `markAsRead`
  - `messages.ts`:
    - `getMessages`
    - `sendMessage`, `deleteMessage`, `toggleReaction`
  - `typing.ts`:
    - `setTyping`
    - `getTypingUsers`

All these functions are called by the frontend via the generated Convex client (`convex/_generated/api`).

---

## 5. Frontend Behavior Details

### 5.1 Chat layout and sidebar

- File: `src/app/chat/ChatLayout.tsx`

The chat layout:

- Shows a sidebar with:
  - Current user info (name/email from Convex)
  - **Profile** button to `/user-profile`
  - Clerk `UserButton`
  - List of conversations (with unread badges, last message, timestamps)
  - User search and group creation tools
- Main content area shows either:
  - “Select a conversation to start chatting.” (no conversation selected)
  - The `ChatThread` for the currently selected conversation

Presence and account setup are handled with:

- Convex `useConvexAuth` + `users.heartbeat`, `users.setOnline`, `users.setOffline`
- Clerk `useUser` + `users.syncFromClerk`

### 5.2 Chat thread

- File: `src/app/chat/[conversationId]/ChatThread.tsx`

Responsible for:

- Validating the conversation ID
- Loading:
  - Current user (`users.me`)
  - Conversation metadata (`conversations.get`)
  - Messages (`messages.getMessages`)
  - Typing users (`typing.getTypingUsers`)
- Header:
  - Other user’s avatar and online status (for direct chats)
  - Group name and member count (for group chats)
  - On group chats:
    - Edit, Save, Cancel buttons for group name
    - Menu for Leave group / Delete group

Messages:

- Show text, deleted state, timestamp, and optional sender name (in group chats)
- Reaction chips for each emoji with counts
- Menu for deleting your own messages

Typing indicator:

- Small bubble below the last message showing:
  - “Alex is typing…” or “Typing…”
  - Three pulsing dots animated with CSS

Auto‑scroll:

- Auto‑scrolls to the bottom when:
  - You are near the bottom and new messages arrive
- When you scroll up:
  - New messages do not force you to the bottom
  - A “↓ New messages” button appears to jump to the latest message

Sending messages:

- Uses `messages.sendMessage` mutation
- Shows “Sending…” on the button while in flight
- Clears the input only after a successful send
- On error:
  - Shows a red error strip with the error message
  - Keeps the original text available for a **Retry** button

---

## 6. Running the Project Locally

**Requirements:**

- Node.js (LTS)
- npm (or yarn/pnpm/bun)
- Convex account
- Clerk account

### 6.1 Install dependencies

From the project root (`tars-livechat` folder):

```bash
npm install
```

### 6.2 Environment variables

Create `.env.local` in the project root and set:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...

NEXT_PUBLIC_CONVEX_URL=...
CONVEX_DEPLOYMENT=...
NEXT_PUBLIC_CONVEX_SITE_URL=...
```

You can copy the structure from the provided example env file if available.

### 6.3 Run Convex dev server

In the same project root:

```bash
npx convex dev
```

This will:

- Link or create a Convex project
- Apply the schema and functions in `convex/`

### 6.4 Run Next.js dev server

In another terminal, from the project root:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

You should be redirected to Clerk sign‑in and then to `/chat`.

---

## 7. Deployment

### 7.1 Deploy Convex backend

From the project root:

```bash
npx convex deploy
```

This pushes the Convex functions and schema to your configured deployment.

### 7.2 Deploy Next.js frontend (Vercel)

You can deploy the Next.js app to Vercel:

1. Push your code to GitHub.
2. Create a new project on Vercel and import the repo.
3. Set the same environment variables in Vercel that you use in `.env.local`.
4. Deploy – Vercel will build and host the Next.js app.

Make sure your Convex URL and Clerk credentials point to your production instances.

---

## 8. For Developers – Extending the App

- To add new features:
  - Start with the Convex backend:
    - Add/extend tables in `convex/schema.ts`
    - Add new query/mutation functions under `convex/`
    - Run `npx convex codegen` to regenerate TypeScript types
  - Then update the frontend:
    - Use `useQuery` / `useMutation` with the generated `api` object
    - Follow existing patterns in `ChatLayout.tsx` and `ChatThread.tsx`

- To modify UI:
  - Use Tailwind and shadcn/ui components under `src/components/ui/`
  - Keep the chat layout responsive (mobile vs desktop behavior is handled with CSS classes)

- To learn more:
  - See `convex/README.md` for backend details
  - Read the source of:
    - `src/app/chat/ChatLayout.tsx`
    - `src/app/chat/[conversationId]/ChatThread.tsx`
    - `src/app/user-profile/page.tsx`

This should give you everything you need to understand how TARS Live Chat works and how to build on top of it.
