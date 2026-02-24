"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import { PaletteIcon } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatMessageTimestamp } from "@/lib/formatTimestamp";

function parseConversationId(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "chat") return parts[1] ?? null;
  return null;
}

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function usePresence() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const heartbeat = useMutation(api.users.heartbeat);
  const setOffline = useMutation(api.users.setOffline);
  const upsertUser = useMutation(api.users.upsertUser);
  const setOnline = useMutation(api.users.setOnline);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    let alive = true;
    const ping = () => {
      if (!alive) return;
      void heartbeat({});
    };

    void upsertUser({});
    void setOnline({ isOnline: true });
    ping();
    const interval = window.setInterval(ping, 25_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void setOnline({ isOnline: true });
        ping();
      }
    };

    const onBeforeUnload = () => {
      void setOffline({});
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", ping);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", ping);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [heartbeat, isAuthenticated, isLoading, setOffline, setOnline, upsertUser]);
}

function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeConversationId =
    (parseConversationId(pathname) as Id<"conversations"> | null) ?? null;
  const isMobileConversationOpen = Boolean(activeConversationId);

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isLoaded: isClerkUserLoaded, user: clerkUser } = useUser();
  const ensureFromIdentity = useMutation(api.users.ensureFromIdentity);
  const syncFromClerk = useMutation(api.users.syncFromClerk);
  const me = useQuery(api.users.me);
  useEffect(() => {
    if (!isLoading && isAuthenticated && me === null) void ensureFromIdentity({});
  }, [ensureFromIdentity, isAuthenticated, isLoading, me]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isClerkUserLoaded && clerkUser) {
      const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
      const imageUrl = clerkUser.imageUrl ?? "";
      void syncFromClerk({
        name: name || clerkUser.username || email || "Unknown",
        email,
        imageUrl,
      });
    }
  }, [clerkUser, isAuthenticated, isClerkUserLoaded, isLoading, syncFromClerk]);

  usePresence();

  const [userSearch, setUserSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Id<"users">[]>([]);

  const conversations = useQuery(api.conversations.getUserConversations, me ? {} : "skip");
  const users = useQuery(
    api.users.getUsers,
    me ? { searchTerm: userSearch.trim() } : "skip",
  );
  const startDirect = useMutation(api.conversations.findOrCreateConversation);
  const createGroup = useMutation(api.conversations.createGroup);

  const filteredUsers = useMemo(() => users ?? [], [users]);

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r bg-background md:w-80",
        isMobileConversationOpen ? "hidden md:flex" : "flex",
      )}
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me?.name ?? "Chat"}</div>
          <div className="truncate text-xs text-muted-foreground">{me?.email ?? ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            type="button"
            onClick={() => router.push("/user-profile")}
          >
            Profile
          </Button>
          <UserButton />
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="text-xs font-medium text-muted-foreground">Conversations</div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {me === null ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              Setting up your account…
            </div>
          ) : null}
          {conversations === undefined ? (
            <div className="space-y-2 px-2 py-2">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>
          ) : (conversations?.length ?? 0) === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              Start a conversation.
            </div>
          ) : (
            conversations?.map((c) => {
              const isActive = c.conversationId === activeConversationId;
              const isGroup = c.isGroup;
              const title = isGroup ? c.name || "Group chat" : c.otherUser?.name ?? "Unknown";
              const subtitle = isGroup
                ? `${c.memberCount} members`
                : c.lastMessageText || "No messages yet";
              const avatarName = isGroup ? title : c.otherUser?.name ?? "";
              const avatarSrc = isGroup ? "" : c.otherUser?.imageUrl ?? "";
              const isOnline = isGroup ? false : Boolean(c.otherUser?.isOnline);
              return (
                <button
                  key={c.conversationId}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent",
                    isActive && "bg-accent",
                  )}
                  onClick={() => router.push(`/chat/${c.conversationId}`)}
                  type="button"
                >
                  <div className="relative">
                    <Avatar className="size-9">
                      <AvatarImage src={avatarSrc} />
                      <AvatarFallback>{initials(avatarName)}</AvatarFallback>
                    </Avatar>
                    {isOnline ? (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-emerald-500" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">
                        {title}
                      </div>
                      {c.lastMessageAt ? (
                        <div className="shrink-0 text-[11px] text-muted-foreground">
                          {formatMessageTimestamp(c.lastMessageAt)}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs text-muted-foreground">
                        {subtitle}
                      </div>
                      {c.unreadCount > 0 ? (
                        <Badge variant="default" className="shrink-0">
                          {c.unreadCount}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Start a conversation</div>
        <Input
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search users…"
        />
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!groupName.trim() || selectedMemberIds.length === 0}
            onClick={async () => {
              const conversationId = await createGroup({
                name: groupName.trim(),
                memberIds: selectedMemberIds,
              });
              setGroupName("");
              setSelectedMemberIds([]);
              router.push(`/chat/${conversationId}`);
            }}
          >
            Group
          </Button>
        </div>
      </div>

      <ScrollArea className="h-56">
        <div className="px-2 pb-3">
          {me === null ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              Setting up your account…
            </div>
          ) : null}
          {(filteredUsers?.length ?? 0) === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">No users found.</div>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u._id}
                className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative">
                    <Avatar className="size-8">
                      <AvatarImage src={u.imageUrl} />
                      <AvatarFallback>{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    {u.isOnline ? (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-emerald-500" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant={selectedMemberIds.includes(u._id) ? "default" : "secondary"}
                    onClick={() => {
                      setSelectedMemberIds((prev) =>
                        prev.includes(u._id) ? prev.filter((id) => id !== u._id) : [...prev, u._id],
                      );
                    }}
                  >
                    {selectedMemberIds.includes(u._id) ? "Selected" : "Add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const conversationId = await startDirect({
                        userId: u._id as Id<"users">,
                      });
                      router.push(`/chat/${conversationId}`);
                    }}
                  >
                    Chat
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeConversationId =
    (parseConversationId(pathname) as Id<"conversations"> | null) ?? null;
  const isMobileConversationOpen = Boolean(activeConversationId);
  const { isLoaded: isClerkLoaded, isSignedIn } = useClerkAuth();
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const likelyMissingConvexJwtTemplate =
    isClerkLoaded && isSignedIn && !isConvexLoading && !isConvexAuthenticated;

  const [theme, setTheme] = useState<"light" | "dark" | "colorful">(
    () => {
      if (typeof window === "undefined") return "light";
      const stored = window.localStorage.getItem("tars-theme");
      if (stored === "light" || stored === "dark" || stored === "colorful") {
        return stored;
      }
      return "light";
    },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("dark", "colorful");
    if (theme === "dark") root.classList.add("dark");
    if (theme === "colorful") root.classList.add("colorful");
    window.localStorage.setItem("tars-theme", theme);
  }, [theme]);

  return (
    <div className="h-dvh w-full">
      <AuthLoading>
        <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
          {likelyMissingConvexJwtTemplate ? (
            <div className="max-w-md text-center">
              <div>Clerk is signed in, but Convex is not authenticated.</div>
              <div className="mt-2">
                In Clerk, ensure the JWT template name is <span className="font-semibold">convex</span> and its audience is{" "}
                <span className="font-semibold">convex</span>. In Convex, ensure the auth provider domain matches the JWT{" "}
                <span className="font-semibold">iss</span>.
              </div>
            </div>
          ) : (
            "Sign in required."
          )}
        </div>
      </Unauthenticated>
      <Authenticated>
        <div className="flex h-dvh w-full flex-col">
          <header className="flex items-center justify-between border-b bg-background px-4 py-3">
            <div className="text-base font-semibold tracking-tight">
              TARS Live Chat
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="flex items-center gap-2"
                >
                  <PaletteIcon className="size-4" />
                  <span className="hidden text-xs font-medium sm:inline">
                    {theme === "light"
                      ? "Light"
                      : theme === "dark"
                        ? "Dark"
                        : "Colorful"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) =>
                    setTheme(value as "light" | "dark" | "colorful")
                  }
                >
                  <DropdownMenuRadioItem value="light">
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="colorful">
                    Colorful
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="flex flex-1">
            <Sidebar />
            <main
              className={cn(
                "flex h-full flex-1 flex-col",
                isMobileConversationOpen ? "flex" : "hidden md:flex",
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </Authenticated>
    </div>
  );
}
