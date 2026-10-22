import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, Briefcase } from "lucide-react";

import { getPublicAgentBusiness, getPublicAgentStarterServices } from "@/features/agent/queries";
import { getBusinessPublicChatPath } from "@/features/businesses/routes";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getPublicAgentBusiness(slug);
  if (!business) return { title: "Services" };
  return {
    title: `Services from ${business.name}`,
    description: business.shortDescription ?? `Choose a service from ${business.name} to get started.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicInquireHubPage({ params }: Props) {
  const { slug } = await params;
  const business = await getPublicAgentBusiness(slug);

  if (!business) notFound();

  const services = await getPublicAgentStarterServices(business.id);

  const showChat = business.agentEnabled;
  const showServices = services.length > 0;
  const chatOnly = showChat && !showServices;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{business.name}</h1>
          {business.shortDescription ? (
            <p className="text-sm text-muted-foreground">{business.shortDescription}</p>
          ) : null}
          <p className="text-base text-foreground/80">
            {showServices ? "Choose a service to get started." : "How would you like to get in touch?"}
          </p>
        </div>

        {chatOnly ? (
          <div className="flex justify-center">
            <ChatCard href={getBusinessPublicChatPath(slug)} wide />
          </div>
        ) : (
          <div className={showChat ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "flex flex-col gap-3"}>
            {showChat ? <ChatCard href={getBusinessPublicChatPath(slug)} /> : null}

            <ul className={showChat ? "contents" : "flex flex-col gap-3"}>
              {services.map((service) => (
                <li key={service.slug} className={showChat ? "sm:col-span-2" : undefined}>
                  <Link
                    href={getBusinessPublicInquiryUrl(slug, service.slug)}
                    className="group flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Briefcase className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{service.name}</p>
                      <p className="text-xs text-muted-foreground">Submit a request for this service.</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

function ChatCard({ href, wide = false }: { href: string; wide?: boolean }) {
  return (
    <Link
      href={href}
      className={
        wide
          ? "group flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border/70 bg-card p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
          : "group flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-card p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
      }
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bot className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">Chat with us</p>
        <p className="text-xs text-muted-foreground">Tell us what you need and we&#39;ll help you get started.</p>
      </div>
    </Link>
  );
}
