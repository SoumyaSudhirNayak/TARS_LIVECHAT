"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMessageTimestamp } from "@/lib/formatTimestamp";

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function isLikelyConvexId(value: string) {
  return /^[a-z0-9]{8,64}$/.test(value);
}

export default function ChatThread({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const cid = conversationId && isLikelyConvexId(conversationId)
    ? (conversationId as unknown as Id<"conversations">)
    : null;

  const me = useQuery(api.users.me);
  const canLoadConversation = Boolean(me && cid);
  const conversationData = useQuery(
    api.conversations.get,
    canLoadConversation ? { conversationId: cid as Id<"conversations"> } : "skip",
  );
  const canLoadMessages = Boolean(canLoadConversation && conversationData);
  const messages = useQuery(
    api.messages.getMessages,
    canLoadMessages ? { conversationId: cid as Id<"conversations">, limit: 100 } : "skip",
  );
  const typingUsers = useQuery(
    api.typing.getTypingUsers,
    canLoadMessages ? { conversationId: cid as Id<"conversations"> } : "skip",
  );

  const sendMessage = useMutation(api.messages.sendMessage);
  const markRead = useMutation(api.conversations.markAsRead);
  const setTyping = useMutation(api.typing.setTyping);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const toggleReaction = useMutation(api.messages.toggleReaction);
  const ensureFromIdentity = useMutation(api.users.ensureFromIdentity);
  const renameGroup = useMutation(api.conversations.renameGroup);
  const leaveGroup = useMutation(api.conversations.leaveGroup);
  const deleteGroup = useMutation(api.conversations.deleteGroup);

  const conversation = conversationData?.conversation ?? null;
  const otherUser = conversationData?.otherUser ?? null;
  const title = conversation?.isGroup
    ? conversation.name || "Group chat"
    : otherUser?.name ?? "Chat";
  const subtitle = conversation?.isGroup
    ? `${conversationData?.users?.length ?? 0} members`
    : otherUser?.isOnline
      ? "Online"
      : "Offline";

  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryBody, setRetryBody] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const typingTimeoutRef = useRef<number | null>(null);
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(() =>
    conversation?.isGroup ? conversation.name || "Group chat" : "",
  );

  useEffect(() => {
    if (me === null) void ensureFromIdentity({});
  }, [ensureFromIdentity, me]);

  const typingLabel = useMemo(() => {
    if (!typingUsers || typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].name} is typing…`;
    return "Typing…";
  }, [typingUsers]);

  const scrollToBottomDomOnly = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
  };

  const scrollToBottom = () => {
    scrollToBottomDomOnly();
    setIsAtBottom(true);
    setLastSeenMessageCount(messages?.length ?? 0);
  };

  useEffect(() => {
    if (!cid) return;
    if (!messages) return;
    if (isAtBottomRef.current) {
      scrollToBottomDomOnly();
    }
    if (me) void markRead({ conversationId: cid });
  }, [cid, markRead, me, messages]);

  useEffect(() => {
    if (!cid || !me) return;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    const hasText = draft.trim().length > 0;
    void setTyping({ conversationId: cid, isTyping: hasText });
    if (hasText) {
      typingTimeoutRef.current = window.setTimeout(() => {
        void setTyping({ conversationId: cid, isTyping: false });
      }, 2000);
    }
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [cid, draft, me, setTyping]);

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => router.push("/chat")}
          >
            Back
          </Button>
          <div className="relative">
            <Avatar className="size-9">
              <AvatarImage src={conversation?.isGroup ? "" : otherUser?.imageUrl ?? ""} />
              <AvatarFallback>{initials(title)}</AvatarFallback>
            </Avatar>
            {!conversation?.isGroup && otherUser?.isOnline ? (
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-emerald-500" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {conversation?.isGroup && isEditingGroupName ? (
                <input
                  className="w-40 rounded-md border bg-background px-2 py-1 text-xs"
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                />
              ) : (
                title
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          </div>
        </div>
        {conversation?.isGroup ? (
          <div className="flex items-center gap-2">
            {isEditingGroupName ? (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setIsEditingGroupName(false);
                    setGroupNameDraft(conversation.name || "Group chat");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  type="button"
                  disabled={!groupNameDraft.trim()}
                  onClick={async () => {
                    if (!cid) return;
                    await renameGroup({
                      conversationId: cid,
                      name: groupNameDraft.trim(),
                    });
                    setIsEditingGroupName(false);
                  }}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setGroupNameDraft(conversation.name || "Group chat");
                    setIsEditingGroupName(true);
                  }}
                >
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" type="button">
                      ⋯
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={async () => {
                        if (!cid) return;
                        await leaveGroup({ conversationId: cid });
                        router.push("/chat");
                      }}
                    >
                      Leave group
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        if (!cid) return;
                        await deleteGroup({ conversationId: cid });
                        router.push("/chat");
                      }}
                    >
                      Delete group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollerRef}
          className="h-full overflow-y-auto px-4 py-4"
          onScroll={() => {
            const el = scrollerRef.current;
            if (!el) return;
            const previousAtBottom = isAtBottomRef.current;
            const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            const atBottom = distanceToBottom < 80;
            isAtBottomRef.current = atBottom;
            setIsAtBottom(atBottom);
            if (atBottom || previousAtBottom !== atBottom) {
              setLastSeenMessageCount(messages?.length ?? 0);
            }
          }}
        >
          {!cid ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Invalid conversation.
            </div>
          ) : null}
          {cid && conversationData === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <div>Conversation not found.</div>
              <Button size="sm" variant="secondary" type="button" onClick={() => router.push("/chat")}>
                Back to chats
              </Button>
            </div>
          ) : null}
          {me === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Setting up your account…
            </div>
          ) : null}
          {messages === undefined ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading messages…
            </div>
          ) : (messages?.length ?? 0) === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No messages yet. Say hello.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {messages?.map((m) => {
                const isMine = me?._id ? m.senderId === me._id : false;
                const displayName = m.sender?.name ?? "Unknown";
                const reactions = m.reactions;
                const allowedEmojis = ["👍", "❤️", "😂", "😮", "😢"] as const;
                return (
                  <div
                    key={m._id}
                    className={cn("flex", isMine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        isMine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 whitespace-pre-wrap break-words">
                          {m.deleted ? (
                            <span className="italic">This message was deleted</span>
                          ) : (
                            m.body
                          )}
                        </div>
                        {isMine && !m.deleted ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className={cn(
                                  "shrink-0 opacity-80 hover:opacity-100",
                                  isMine ? "text-primary-foreground" : "",
                                )}
                                type="button"
                              >
                                ⋯
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={async () => {
                                  await deleteMessage({ messageId: m._id });
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>

                      {!m.deleted ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {reactions?.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                r.reactedByMe
                                  ? "border-primary/40 bg-primary/10"
                                  : "border-border bg-background/40",
                              )}
                              onClick={async () => {
                                await toggleReaction({ messageId: m._id, emoji: r.emoji });
                              }}
                            >
                              {r.emoji} {r.count}
                            </button>
                          ))}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px]"
                              >
                                +
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={isMine ? "end" : "start"}>
                              {allowedEmojis.map((emoji) => (
                                <DropdownMenuItem
                                  key={emoji}
                                  onClick={async () => {
                                    await toggleReaction({ messageId: m._id, emoji });
                                  }}
                                >
                                  {emoji}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "mt-1 text-[11px]",
                          isMine ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {!isMine && conversation?.isGroup ? `${displayName} · ` : !isMine ? `${displayName} · ` : ""}
                        {formatMessageTimestamp(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {typingLabel ? (
                <div className="mt-3 flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate max-w-[160px]">{typingLabel}</span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:0.3s]" />
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {!isAtBottom && (messages?.length ?? 0) > lastSeenMessageCount ? (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <Button size="sm" onClick={scrollToBottom}>
              ↓ New messages
            </Button>
          </div>
        ) : null}
      </div>

      {cid && me && conversationData ? (
        <div className="border-t p-4">
        {sendError ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <div className="min-w-0 truncate">{sendError}</div>
            {retryBody ? (
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={async () => {
                  if (!cid || !me) return;
                  try {
                    setSendError(null);
                    await sendMessage({ conversationId: cid, body: retryBody });
                    setRetryBody(null);
                    scrollToBottom();
                  } catch (e) {
                    setSendError(e instanceof Error ? e.message : "Failed to send message");
                  }
                }}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cid || !me || isSending) return;
            const body = draft.trim();
            if (!body) return;
            void setTyping({ conversationId: cid, isTyping: false });
            setIsSending(true);
            try {
              setSendError(null);
              await sendMessage({ conversationId: cid, body });
              setDraft("");
              scrollToBottom();
            } catch (err) {
              setRetryBody(body);
              setSendError(
                err instanceof Error ? err.message : "Failed to send message",
              );
            } finally {
              setIsSending(false);
            }
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
              }
            }}
          />
          <Button type="submit" disabled={!draft.trim() || isSending}>
            {isSending ? "Sending…" : "Send"}
          </Button>
        </form>
        </div>
      ) : null}
    </div>
  );
}
