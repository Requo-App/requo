import { CrispChatWidgetServer } from "@/components/integrations/crisp/crisp-chat-widget-server";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="font-scope-geist relative isolate min-h-screen dark:[--background:#161616] dark:bg-[#161616]">
      {children}
      <CrispChatWidgetServer />
    </div>
  );
}
