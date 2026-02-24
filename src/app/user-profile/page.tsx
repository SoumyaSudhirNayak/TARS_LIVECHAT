"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Page() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name ?? "");
      setImageUrl(me.imageUrl ?? "");
    }
  }, [me]);

  const canSave = Boolean(name.trim() && me);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold">Edit profile</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => router.push("/chat")}
          >
            Back
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={!canSave || isSaving}
            onClick={async () => {
              if (!me || !name.trim()) return;
              setIsSaving(true);
              setError(null);
              try {
                await updateProfile({
                  name: name.trim(),
                  imageUrl: imageUrl.trim() || "",
                });
                router.push("/chat");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Failed to save profile",
                );
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Avatar className="mb-4 size-24">
          <AvatarImage src={imageUrl} />
          <AvatarFallback>
            {name ? name.trim()[0]?.toUpperCase() ?? "?" : "?"}
          </AvatarFallback>
        </Avatar>

        <div className="w-full max-w-sm space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Image URL"
          />
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {!me ? (
            <p className="text-xs text-muted-foreground">
              Loading your profile…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
