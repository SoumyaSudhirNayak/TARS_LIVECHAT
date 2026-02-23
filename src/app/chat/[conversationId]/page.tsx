import ChatThread from "./ChatThread";

export default async function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ChatThread conversationId={conversationId} />;
}
