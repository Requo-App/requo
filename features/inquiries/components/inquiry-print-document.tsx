import { AtSign, Mail } from "lucide-react";

import { InfoTile } from "@/components/shared/info-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCustomSubmittedFields,
  systemFieldDefaultLabels,
} from "@/features/inquiries/form-config";
import type { DashboardInquiryDetail } from "@/features/inquiries/types";
import {
  formatFileSize,
  formatInquiryBudget,
  formatInquiryDateTime,
  getContactMethodLabel,
  getCustomerContactEmail,
  getInquirySourceLabel,
  getInquiryStatusLabel,
} from "@/features/inquiries/utils";
import { formatQuoteMoney } from "@/features/quotes/utils";

type InquiryPrintDocumentProps = {
  businessName: string;
  businessCurrency: string;
  inquiry: DashboardInquiryDetail;
};

export function InquiryPrintDocument({
  businessName,
  businessCurrency,
  inquiry,
}: InquiryPrintDocumentProps) {
  const customFields = getCustomSubmittedFields(
    inquiry.submittedFieldSnapshot,
  );
  const details = inquiry.details.trim();
  const customerContactEmail = getCustomerContactEmail(inquiry);
  const showPreferredContact = shouldShowPreferredContactTile(inquiry);

  return (
    <div
      className="mx-auto flex w-full max-w-[62rem] flex-col gap-4"
      data-export-document
    >
      <section data-padding="none" className="section-panel overflow-hidden print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-2 border-b border-border/70 pb-3">
            <p className="meta-label">Inquiry printout</p>
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance">
                {inquiry.customerName}
              </h2>
              <p className="text-sm text-muted-foreground">{businessName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-foreground">
                Ref {inquiry.id}
              </Badge>
              <Badge variant="outline">{inquiry.serviceName ?? getInquirySourceLabel(inquiry.source)}</Badge>
              <Badge variant="outline">
                {formatInquiryDateTime(inquiry.submittedAt)}
              </Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile
              className={showPreferredContact ? undefined : "sm:col-span-2"}
              icon={Mail}
              label="Email"
              value={customerContactEmail ?? "Not provided"}
              valueClassName="break-all"
            />
            {showPreferredContact ? (
              <InfoTile
                icon={AtSign}
                label={getContactMethodLabel(inquiry.customerContactMethod)}
                value={inquiry.customerContactHandle}
                valueClassName="break-all"
              />
            ) : null}
            <InfoTile
              label="Received"
              value={formatInquiryDateTime(inquiry.submittedAt)}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <div className="flex flex-col gap-3">
          <Card className="gap-0 print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
            <CardHeader className="gap-1 pb-2">
              <CardTitle>Inquiry summary</CardTitle>
              <p className="text-sm text-muted-foreground">
                Submitted through the public service page.
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <InfoTile
                label="Service"
                value={inquiry.serviceName ?? getInquirySourceLabel(inquiry.source)}
              />
              <InfoTile
                label="Source"
                value={getInquirySourceLabel(inquiry.source)}
              />
              <InfoTile
                label={systemFieldDefaultLabels.budgetText}
                value={formatInquiryBudget(inquiry.budgetText)}
              />
              <InfoTile
                label={systemFieldDefaultLabels.requestedDeadline}
                value={inquiry.requestedDeadline ?? "Not provided"}
              />
              <InfoTile
                label="Status"
                value={getInquiryStatusLabel(inquiry.status)}
              />
              {inquiry.subject &&
              inquiry.subject !== (inquiry.serviceName ?? "") ? (
                <InfoTile
                  className="sm:col-span-2"
                  label="Subject"
                  value={inquiry.subject}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-0 print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
            <CardHeader className="gap-1 pb-2">
              <CardTitle>{systemFieldDefaultLabels.details}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Customer-provided details only.
              </p>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {details}
              </p>
            </CardContent>
          </Card>

          {customFields.length ? (
            <section>
              <div className="grid gap-2 sm:grid-cols-2">
                {customFields.map((field) => (
                  <InfoTile
                    key={field.id}
                    label={field.label}
                    value={field.displayValue}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Card className="gap-0 print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
            <CardHeader className="gap-1 pb-2">
              <CardTitle>Attachments</CardTitle>
              <p className="text-sm text-muted-foreground">
                File metadata from the inquiry.
              </p>
            </CardHeader>
            <CardContent>
              {inquiry.attachments.length ? (
                <div className="flex flex-col gap-2">
                  {inquiry.attachments.map((attachment) => (
                    <div
                      data-padding="none"
                      className="soft-panel px-3 py-3 shadow-none print:border print:border-border/70"
                      key={attachment.id}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-foreground">
                            {attachment.fileName}
                          </p>
                          <Badge variant="secondary">{attachment.contentType}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(attachment.fileSize)} |{" "}
                          {formatInquiryDateTime(attachment.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No attachments were included.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
            <CardHeader className="gap-1 pb-2">
              <CardTitle>Related quote</CardTitle>
              <p className="text-sm text-muted-foreground">
                Only included when a quote already exists.
              </p>
            </CardHeader>
            <CardContent>
              {inquiry.relatedQuotes ? (
                <div className="grid gap-3">
                  <InfoTile
                    label="Quote"
                    value={inquiry.relatedQuotes.latest.quoteNumber ?? inquiry.relatedQuotes.latest.id}
                  />
                  <InfoTile label="Status" value={inquiry.relatedQuotes.latest.status} />
                  <InfoTile
                    label="Total"
                    value={formatQuoteMoney(
                      inquiry.relatedQuotes.latest.totalInCents,
                      businessCurrency,
                    )}
                  />
                  <InfoTile
                    label="Created"
                    value={formatInquiryDateTime(inquiry.relatedQuotes.latest.createdAt)}
                  />
                  <InfoTile
                    label="Quote count"
                    value={`${inquiry.relatedQuotes.count}`}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No related quote has been generated yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Print keeps the narrower rule (email-method handles never get their own
// tile — the Email tile above already covers them), unlike the dashboard
// version in utils which shows a differing email handle.
function shouldShowPreferredContactTile(contact: {
  customerContactMethod: string;
  customerContactHandle: string;
}) {
  return (
    contact.customerContactHandle.trim().length > 0 &&
    contact.customerContactMethod.trim().toLowerCase() !== "email"
  );
}
