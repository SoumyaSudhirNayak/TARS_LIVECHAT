import { ReactNode } from "react";
import ChatLayout from "./ChatLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <ChatLayout>{children}</ChatLayout>;
}

