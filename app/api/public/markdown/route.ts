import { NextResponse } from "next/server";

const markdownContent = `# Requo

Requo is quote and inquiry management software for service businesses. It connects the workflow from inquiry to quote, quote response, and follow-up.

## Capabilities

- **Inquiries**: Capture requests through public service pages, a customer-facing Agent, or manual entry; search, filter, qualify, and detect potential duplicates.
- **Quotes**: Create professional quotes from inquiries, use your quote library and quote templates, share by public link or Requo email, and track draft, sent, viewed, accepted, rejected, expired, and voided states.
- **Follow-ups**: Create reminders for inquiries and quotes, or automatically send follow-up emails on Pro and Business plans.
- **AI drafting**: Generate reviewable quote drafts grounded in your pricing library, past quotes, templates, and business knowledge.
- **Analytics and exports**: Review conversion and workflow performance, schedule reports on paid plans, and export inquiries and quotes as CSV.
- **Assistant and Agent**: The owner Assistant operates on business data inside the dashboard; the public Agent answers questions and collects qualified inquiries on Pro and Business plans.

## Agent Discoverability

- LLM context: \`/llms.txt\`

- API Catalog: \`/.well-known/api-catalog\`
- OAuth Configuration: \`/.well-known/openid-configuration\`
- MCP Server Card: \`/.well-known/mcp/server-card.json\`
- Agent Skills: \`/.well-known/agent-skills/index.json\`
`;

export async function GET() {
  const headers = new Headers();
  headers.set("Content-Type", "text/markdown");
  headers.set("x-markdown-tokens", "220"); // Approximate token count

  return new NextResponse(markdownContent, {
    status: 200,
    headers,
  });
}
