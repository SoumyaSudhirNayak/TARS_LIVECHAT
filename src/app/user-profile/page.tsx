"use client";

import { UserProfile } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-dvh justify-center p-4">
      <UserProfile />
    </div>
  );
}

