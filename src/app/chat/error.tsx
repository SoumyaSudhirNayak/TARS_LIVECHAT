"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-4">
        <div className="text-sm font-semibold">Something went wrong</div>
        <div className="mt-1 text-sm text-muted-foreground">{error.message}</div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => reset()} type="button">
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
