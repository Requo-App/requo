import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type CsvRow = Record<string, string>;

const outputDirectory = path.join(process.cwd(), "support", "knowledge");

const faqRows: CsvRow[] = [
  {
    category: "Onboarding",
    question: "How do I create my first business?",
    answer:
      "After signup, complete onboarding to create your first business. You can rename it any time in Settings > General.",
    tags: "onboarding,business-setup,business",
    channel: "chat",
  },
  {
    category: "Quotes",
    question: "Can I turn an inquiry into a quote without retyping details?",
    answer:
      "Yes. Open the inquiry, choose Create Quote, and Requo pre-fills customer details and service context.",
    tags: "quotes,inquiries,workflow",
    channel: "chat",
  },
  {
    category: "Billing",
    question: "Where can I update my subscription plan?",
    answer: "Go to Settings > Billing to upgrade, downgrade, or review your current plan and usage.",
    tags: "billing,plan,subscription",
    channel: "chat",
  },
  {
    category: "Billing",
    question: "Do you offer yearly billing?",
    answer:
      "Yes. Eligible plans support monthly and yearly billing cycles. Switch from the Billing page at any time.",
    tags: "billing,yearly,pricing",
    channel: "chat",
  },
  {
    category: "Access",
    question: "How do I invite a teammate?",
    answer: "Use Settings > Members to send an invite link and assign their role.",
    tags: "members,invites,roles",
    channel: "chat",
  },
  {
    category: "Support",
    question: "How quickly does support reply?",
    answer:
      "We usually respond within one business day. Urgent billing or access issues are prioritized.",
    tags: "support,sla,response-time",
    channel: "chat",
  },
  {
    category: "Troubleshooting",
    question: "Why is my quote email not sending?",
    answer:
      "Check Email settings, sender domain configuration, and whether your plan includes sending limits. Then retry from the quote page.",
    tags: "email,quotes,troubleshooting",
    channel: "chat",
  },
  {
    category: "Inquiries",
    question: "Can I embed inquiry forms on my website?",
    answer:
      "Yes. Publish an inquiry form and use the provided link or embed setup from the Forms section.",
    tags: "inquiries,forms,embed",
    channel: "chat",
  },
  {
    category: "Follow-ups",
    question: "How do follow-up reminders work?",
    answer:
      "Requo can automatically create follow-up tasks when quotes are viewed but not responded to. Adjust timing in Settings > Workflow Defaults.",
    tags: "follow-ups,quotes,workflow",
    channel: "chat",
  },
  {
    category: "Knowledge",
    question: "What is the Knowledge section used for?",
    answer:
      "Knowledge stores reusable business context and FAQs that help AI drafting produce better replies and quote content.",
    tags: "knowledge,ai,settings",
    channel: "chat",
  },
  {
    category: "Security",
    question: "How do I secure access to my business?",
    answer:
      "Use strong account passwords, review team member roles regularly, and remove old members from Settings > Members.",
    tags: "security,members,access-control",
    channel: "chat",
  },
];

const cannedResponseRows: CsvRow[] = [
  {
    intent: "welcome_new_user",
    tone: "friendly",
    response:
      "Welcome to Requo! I can help with onboarding, billing, and workflow setup. What do you want to set up first?",
    use_case: "first-chat-message",
  },
  {
    intent: "request_business_slug",
    tone: "clear",
    response:
      "Please share your business slug and the page you are on so I can guide you with exact steps.",
    use_case: "triage",
  },
  {
    intent: "billing_update_card",
    tone: "helpful",
    response:
      "You can update your payment method in Settings > Billing. Open Billing and use the payment method section to change your card.",
    use_case: "billing",
  },
  {
    intent: "quote_status_explanation",
    tone: "concise",
    response:
      "Quote statuses track progress from sent to viewed, accepted, rejected, expired, or voided so your pipeline stays accurate.",
    use_case: "quotes",
  },
  {
    intent: "form_submission_issue",
    tone: "diagnostic",
    response:
      "Let us check this together. Please send the form URL, browser, and the exact error message so we can reproduce quickly.",
    use_case: "troubleshooting",
  },
  {
    intent: "feature_request",
    tone: "receptive",
    response:
      "Thanks for the idea. Share your workflow and desired outcome so we can evaluate and prioritize it accurately.",
    use_case: "product-feedback",
  },
  {
    intent: "cancel_subscription",
    tone: "empathetic",
    response:
      "I can help with that. Go to Settings > Billing to manage cancellation. Your access remains active through the current period.",
    use_case: "billing",
  },
  {
    intent: "data_export",
    tone: "clear",
    response:
      "For exports, open the related module (Quotes or Inquiries) and choose export from the table actions menu.",
    use_case: "data-management",
  },
  {
    intent: "handoff_human_agent",
    tone: "professional",
    response:
      "I am escalating this to our support team with your context so you do not need to repeat details.",
    use_case: "escalation",
  },
  {
    intent: "knowledge_import_help",
    tone: "guided",
    response:
      "You can paste source content in Knowledge and use the importer to extract structured entries for AI drafting.",
    use_case: "knowledge",
  },
];

const supportIntentRows: CsvRow[] = [
  {
    intent: "onboarding_setup",
    example_utterance: "I just signed up, what should I do first?",
    primary_team: "customer-success",
    priority: "normal",
    suggested_action: "share_onboarding_steps",
  },
  {
    intent: "quote_creation_help",
    example_utterance: "How do I create a quote from an inquiry?",
    primary_team: "product-support",
    priority: "normal",
    suggested_action: "share_quote_workflow_guide",
  },
  {
    intent: "billing_failed_payment",
    example_utterance: "My subscription payment failed this month.",
    primary_team: "billing-support",
    priority: "high",
    suggested_action: "request_account_and_payment_details",
  },
  {
    intent: "access_issue_member",
    example_utterance: "My teammate cannot access settings pages.",
    primary_team: "product-support",
    priority: "high",
    suggested_action: "check_member_role_permissions",
  },
  {
    intent: "email_delivery_issue",
    example_utterance: "Customers are not receiving quote emails.",
    primary_team: "technical-support",
    priority: "high",
    suggested_action: "verify_sender_config_and_logs",
  },
  {
    intent: "feature_explanation_knowledge",
    example_utterance: "What does the Knowledge section actually do?",
    primary_team: "customer-success",
    priority: "normal",
    suggested_action: "explain_ai_context_usage",
  },
  {
    intent: "bug_report_ui",
    example_utterance: "The settings page keeps blanking on mobile.",
    primary_team: "technical-support",
    priority: "high",
    suggested_action: "collect_device_browser_and_repro_steps",
  },
  {
    intent: "refund_request",
    example_utterance: "I need a refund for a recent charge.",
    primary_team: "billing-support",
    priority: "high",
    suggested_action: "verify_order_and_route_refund_workflow",
  },
  {
    intent: "integration_request",
    example_utterance: "Can you help me connect this with my website form?",
    primary_team: "customer-success",
    priority: "normal",
    suggested_action: "share_form_embed_and_public_page_steps",
  },
  {
    intent: "account_cancellation",
    example_utterance: "Please cancel my account and remove billing.",
    primary_team: "billing-support",
    priority: "high",
    suggested_action: "confirm_cancellation_scope_and_timing",
  },
];

const onboardingGuideRows: CsvRow[] = [
  {
    guide_id: "onb_001",
    stage: "account_setup",
    title: "Complete your profile and business details",
    steps:
      "Open Settings > General, confirm business name, timezone, and contact details, then save changes.",
    expected_outcome: "Business profile is ready for customer-facing workflows",
    related_feature: "settings-general",
  },
  {
    guide_id: "onb_002",
    stage: "inquiry_capture",
    title: "Publish your inquiry form",
    steps:
      "Go to Forms, choose your business type, customize fields, and publish the form link.",
    expected_outcome: "Customers can submit inquiries to your business",
    related_feature: "forms",
  },
  {
    guide_id: "onb_003",
    stage: "quote_workflow",
    title: "Create your first quote",
    steps:
      "Open an inquiry, click Create Quote, review line items and terms, then save and send.",
    expected_outcome: "Quote pipeline starts with sent and trackable statuses",
    related_feature: "quotes",
  },
  {
    guide_id: "onb_004",
    stage: "follow_up",
    title: "Set up follow-up reminders",
    steps:
      "Create follow-ups for quotes that need attention, and adjust timing in Settings > Workflow Defaults.",
    expected_outcome: "Follow-up reminders keep deals moving forward",
    related_feature: "follow-ups",
  },
  {
    guide_id: "onb_005",
    stage: "billing",
    title: "Choose the right plan for your volume",
    steps:
      "Visit Settings > Billing, compare limits for quotes, members, and AI usage, then select a plan.",
    expected_outcome: "Plan matches operational needs and reduces workflow friction",
    related_feature: "billing",
  },
  {
    guide_id: "onb_006",
    stage: "team_setup",
    title: "Invite team members with the right role",
    steps:
      "Go to Settings > Members, send invites, and assign permissions based on responsibilities.",
    expected_outcome: "Team has controlled access to business data and tools",
    related_feature: "members",
  },
  {
    guide_id: "onb_007",
    stage: "knowledge_setup",
    title: "Add reusable business knowledge",
    steps:
      "Open Settings > Knowledge, add FAQs, policies, and service details to improve AI draft quality.",
    expected_outcome: "AI suggestions are aligned with your business context",
    related_feature: "knowledge",
  },
  {
    guide_id: "onb_008",
    stage: "support",
    title: "Use support channels effectively",
    steps:
      "Use Support settings to open chat, review FAQs, and email support with issue details.",
    expected_outcome: "Faster issue resolution with complete troubleshooting context",
    related_feature: "settings-support",
  },
  {
    guide_id: "onb_009",
    stage: "optimization",
    title: "Review analytics for conversion gaps",
    steps:
      "Check Analytics for quote view-to-accept rates, then adjust follow-up timing and quote presentation.",
    expected_outcome: "Improved quote conversion and clearer sales insights",
    related_feature: "analytics",
  },
];

function escapeCell(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildCsv(rows: CsvRow[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}

async function writeCsv(filename: string, rows: CsvRow[]) {
  const fullPath = path.join(outputDirectory, filename);
  const csv = buildCsv(rows);
  await writeFile(fullPath, csv, "utf8");
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all([
    writeCsv("faq.csv", faqRows),
    writeCsv("canned_responses.csv", cannedResponseRows),
    writeCsv("support_intents.csv", supportIntentRows),
    writeCsv("onboarding_guides.csv", onboardingGuideRows),
  ]);

  console.log(`Support knowledge CSV files written to ${outputDirectory}`);
}

main().catch((error) => {
  console.error("Failed to generate support CSV files.", error);
  process.exitCode = 1;
});
