"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";

function base64UrlDecode(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function decodeJwt(token: string) {
  const [headerB64, payloadB64] = token.split(".");
  if (!headerB64 || !payloadB64) return null;
  try {
    const header = JSON.parse(base64UrlDecode(headerB64)) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as Record<string, unknown>;
    return { header, payload };
  } catch {
    return null;
  }
}

export default function Page() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } = useConvexAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isLoaded || !isSignedIn) {
        setToken(null);
        return;
      }
      const t = await getToken({ template: "convex" });
      if (!cancelled) setToken(t);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const decoded = useMemo(() => (token ? decodeJwt(token) : null), [token]);
  const iss = (decoded?.payload?.["iss"] ?? null) as string | null;
  const aud = decoded?.payload?.["aud"] ?? null;
  const sub = (decoded?.payload?.["sub"] ?? null) as string | null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 text-sm">
      <div className="rounded-lg border p-4">
        <div className="font-semibold">Clerk</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="text-muted-foreground">isLoaded</div>
          <div>{String(isLoaded)}</div>
          <div className="text-muted-foreground">isSignedIn</div>
          <div>{String(isSignedIn)}</div>
          <div className="text-muted-foreground">token(template=convex)</div>
          <div className="truncate">{token ? "present" : "missing"}</div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-semibold">Convex</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="text-muted-foreground">isLoading</div>
          <div>{String(isConvexLoading)}</div>
          <div className="text-muted-foreground">isAuthenticated</div>
          <div>{String(isConvexAuthenticated)}</div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-semibold">JWT Claims</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="text-muted-foreground">iss</div>
          <div className="break-all">{iss ?? "—"}</div>
          <div className="text-muted-foreground">aud</div>
          <div className="break-all">{aud ? JSON.stringify(aud) : "—"}</div>
          <div className="text-muted-foreground">sub</div>
          <div className="break-all">{sub ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

